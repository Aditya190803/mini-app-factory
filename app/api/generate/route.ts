import { z } from 'zod';
import { assertProjectRole } from '@/lib/project-access';
import { getProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { usesOwnKeys } from '@/lib/ai-client';
import { getServerEnv } from '@/lib/env';
import { aiQuotaBuckets, consumeRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import { getPersistedAISettings, getGlobalAdminModelConfig } from '@/lib/ai-settings-store';
import { appendReferenceUrlToPrompt } from '@/lib/resolve-reference-url';
import { createSSEWriter } from '@/lib/sse-writer';
import { reportError } from '@/lib/error-reporting';
import { classifyGenerationError, runGeneration } from '@/lib/generate-run';
import {
  appendProjectMessage,
  createProjectRun,
  createProjectVersion,
  createRunEventWriter,
  finishProjectRun,
  watchRunCancellation,
} from '@/lib/project-runs';

const generateSchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid project name'),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  referenceUrl: z.string().trim().max(2048).optional(),
}).strict();

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    try {
      getServerEnv();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid environment configuration';
      return Response.json({ error: message, code: 'ENV_INVALID', requestId }, { status: 500 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON payload', code: 'INVALID_JSON', requestId }, { status: 400 });
    }
    const parsed = generateSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload', code: 'INVALID_PAYLOAD', requestId }, { status: 400 });
    }

    const { prompt, projectName, referenceUrl } = parsed.data;

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
    }

    const projectRecord = await getProject(projectName);
    const access = assertProjectRole(projectRecord, user.id, 'editor');
    if (!access.ok) {
      const code = access.status === 404 ? 'PROJECT_NOT_FOUND' : access.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
      return Response.json({ error: access.message, code, requestId }, { status: access.status });
    }
    const project = access.project;

    const [globalAdminConfig, persistedSettings] = await Promise.all([getGlobalAdminModelConfig(), getPersistedAISettings()]);
    const runtimeConfig: AIRuntimeConfig = {
      adminConfig: globalAdminConfig,
      byokConfig: persistedSettings.byokConfig,
    };

    const rateLimit = await consumeRateLimit('generate', user.id, aiQuotaBuckets(usesOwnKeys(runtimeConfig)));
    if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, requestId);

    const basePrompt = (prompt || project.prompt || '').trim();
    if (!basePrompt) {
      return Response.json(
        { error: 'Prompt is required', code: 'INVALID_PAYLOAD', requestId },
        { status: 400 }
      );
    }

    const enriched = await appendReferenceUrlToPrompt(basePrompt, {
      referenceUrl,
      storedReferenceUrl: project.referenceUrl,
      storedDescription: project.description,
    });
    const finalPrompt = enriched.prompt;
    let run: Awaited<ReturnType<typeof createProjectRun>>;
    try {
      run = await createProjectRun(projectName, 'initial', basePrompt);
    } catch (err) {
      if (err instanceof Error && err.message.includes('RUN_IN_PROGRESS')) {
        return Response.json({ error: 'A build is already running for this project.', code: 'RUN_IN_PROGRESS', requestId }, { status: 409 });
      }
      throw err;
    }
    const { runId, projectId } = run;
    await appendProjectMessage(projectName, 'user', basePrompt);

    // Aborted when the run is cancelled from the Stop button (watched below). A disconnected
    // browser does not abort: the durable run record lets the UI recover.
    const abortController = new AbortController();
    const stopWatching = watchRunCancellation(projectId, runId, abortController);
    const events = createRunEventWriter(projectId, runId, `Generation ${requestId}`);

    let sse: ReturnType<typeof createSSEWriter>;

    const stream = new ReadableStream({
      start(controller) {
        sse = createSSEWriter(controller);
        const heartbeat = setInterval(() => {
          if (sse.isClosed() || !sse.write({ status: 'ping' })) clearInterval(heartbeat);
        }, 8000);

        events.write('started', 'Build started');
        sse.write({ status: 'started', message: 'Build started', requestId, runId });

        (async () => {
          const result = await runGeneration({
            projectName,
            prompt: finalPrompt,
            signal: abortController.signal,
            onEvent: (event) => {
              if (event.type === 'provider.fallback') {
                sse.write({ status: 'fallback', message: event.data.message });
              } else if (event.type === 'provider.selected') {
                sse.write({
                  status: 'provider',
                  message: event.data.message,
                  providerId: event.data.providerId,
                  model: event.data.model,
                  label: event.data.label,
                });
              }
            },
            requestId,
            runtimeConfig,
            onProgress: (event) => {
              events.write(event.status, event.message, event.path);
              sse.write({ ...event, runId });
            },
          });
          await events.flush();

          if ('error' in result) {
            if (result.cancelled) {
              await finishProjectRun({ projectId, runId, status: 'cancelled', usage: result.usage });
              sse.write({ status: 'error', error: 'Build cancelled.', code: 'ABORTED', requestId });
              return;
            }
            const errorInfo = classifyGenerationError(result.error);
            events.write('error', errorInfo.message);
            await events.flush();
            await finishProjectRun({ projectId, runId, status: 'failed', errorCode: errorInfo.code, errorMessage: errorInfo.message, usage: result.usage });
            await appendProjectMessage(projectName, 'system', `Build failed: ${errorInfo.message}`, 'failed');
            sse.write({ status: 'error', error: errorInfo.message, code: errorInfo.code, requestId });
            return;
          }

          events.write('completed', `Created ${result.files.length} project files`);
          await events.flush();
          await finishProjectRun({ projectId, runId, status: 'completed', usage: result.usage });
          const messageId = await appendProjectMessage(projectName, 'assistant', `Built the initial project with ${result.files.length} files.`, 'completed', JSON.stringify({ files: result.files.map((file) => file.path) }));
          await createProjectVersion(projectName, 'Initial build', JSON.stringify(result.files), messageId);
          // Keep the SSE payload small. Huge file bodies used to stall the browser parser and
          // leave the UI stuck on the last progress event. The editor loads files from Convex
          // after status flips to completed.
          sse.write({
            status: 'completed',
            html: result.html?.slice(0, 2000) || '',
            files: result.files.map((file) => ({
              path: file.path,
              language: file.language,
              fileType: file.fileType,
              content: '',
            })),
            requestId,
            runId,
          });
        })()
          .catch(async (err) => {
            const errorInfo = classifyGenerationError(err instanceof Error ? err.message : err);
            await reportError(err, { source: 'generate', requestId, project: projectName });
            // The project may have been deleted mid-run; that must not become an unhandled rejection.
            await finishProjectRun({ projectId, runId, status: 'failed', errorCode: errorInfo.code, errorMessage: errorInfo.message }).catch(() => undefined);
            sse.write({ status: 'error', error: errorInfo.message, code: errorInfo.code, requestId });
          })
          .finally(() => {
            stopWatching();
            clearInterval(heartbeat);
            sse.close();
          });
      },
      cancel() {
        if (sse) sse.markClosed();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    const errorInfo = classifyGenerationError(error instanceof Error ? error.message : error);
    await reportError(error, { source: 'generate', requestId, stage: 'initialize' });
    return Response.json({ error: errorInfo.message, code: errorInfo.code, requestId }, { status: 500 });
  }
}
