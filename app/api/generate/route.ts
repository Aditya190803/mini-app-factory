import { z } from 'zod';
import { getProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { getServerEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import { getPersistedAISettings, getGlobalAdminModelConfig } from '@/lib/ai-settings-store';
import { createSSEWriter } from '@/lib/sse';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { runGeneration, classifyGenerationError } from '@/lib/generation-engine';

const generateSchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid project name'),
  prompt: z.string().trim().min(1).max(8_000).optional(),
}).strict();

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    // CSRF origin validation
    if (request instanceof Request && !validateOrigin(request as unknown as import('next/server').NextRequest)) {
      return Response.json({ error: 'Invalid origin', code: 'CSRF_REJECTED', requestId }, { status: 403 });
    }

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

    const { prompt, projectName } = parsed.data;

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({ key: `${user.id}:generate`, limit: 10, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return Response.json(
        { error: 'Rate limit exceeded. Please wait before retrying.', code: 'RATE_LIMITED', retryAfter, requestId },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const project = await getProject(projectName);
    if (!project) {
      return Response.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND', requestId }, { status: 404 });
    }

    if (project.userId && project.userId !== user.id) {
      return Response.json({ error: 'Unauthorized to edit this project', code: 'FORBIDDEN', requestId }, { status: 403 });
    }

    const finalPrompt = (prompt || project.prompt || '').trim();
    if (!finalPrompt) {
      return Response.json(
        { error: 'Prompt is required', code: 'INVALID_PAYLOAD', requestId },
        { status: 400 }
      );
    }

    // Use AbortController to signal cancellation to the generation workflow
    const abortController = new AbortController();
    const globalAdminConfig = await getGlobalAdminModelConfig();
    const persistedSettings = await getPersistedAISettings(user.id);
    const runtimeConfig: AIRuntimeConfig = {
      adminConfig: globalAdminConfig,
      byokConfig: persistedSettings.byokConfig,
    };

    // Also listen to the request's abort signal (client disconnect)
    request.signal.addEventListener('abort', () => abortController.abort());

    let sse: ReturnType<typeof createSSEWriter>;

    const stream = new ReadableStream({
      start(controller) {
        sse = createSSEWriter(controller, abortController.signal);
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        // Start heartbeat immediately
        heartbeat = setInterval(() => {
          if (sse.isClosed()) {
            if (heartbeat) clearInterval(heartbeat);
            abortController.abort();
            return;
          }
          if (!sse.write({ status: 'ping' })) {
            if (heartbeat) clearInterval(heartbeat);
            abortController.abort();
          }
        }, 8000);

        // Send initial status
        if (!sse.write({ status: 'initializing', message: 'Setting up production environment...' })) {
          if (heartbeat) clearInterval(heartbeat);
          abortController.abort();
          return;
        }

        // Run the generation
        (async () => {
          await new Promise(r => setTimeout(r, 600));
          if (sse.isClosed()) return;

          if (!sse.write({ status: 'analyzing', message: 'Analyzing visual requirements...' })) {
            return;
          }
          await new Promise(r => setTimeout(r, 400));

          if (!sse.write({ status: 'designing', message: 'Architecting design system...' })) {
            return;
          }

          const result = await runGeneration(
            projectName,
            finalPrompt,
            abortController.signal,
            (event) => {
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
            runtimeConfig
          );

          // Check stream state before any writes
          if (sse.isClosed()) return;

          if ('error' in result && result.error !== 'Aborted') {
            const errorInfo = classifyGenerationError(result.error);
            sse.write({ status: 'error', error: errorInfo.message, code: errorInfo.code, requestId });
          } else if ('html' in result) {
            // Double-check stream state before each write
            if (!sse.write({ status: 'fabricating', message: 'Fabricating production code...' })) return;
            await new Promise(r => setTimeout(r, 300));
            if (!sse.write({ status: 'finalizing', message: 'Polishing and optimizing...' })) return;
            await new Promise(r => setTimeout(r, 300));
            if (!sse.isClosed()) {
              sse.write({ status: 'completed', html: result.html, files: result.files, requestId });
            }
          }
        })()
          .catch((err) => {
            const errorInfo = classifyGenerationError(err instanceof Error ? err.message : err);
            logger.error(`[Generation ${requestId}] workflow error`, { error: err instanceof Error ? err.message : String(err) });
            if (!sse.isClosed()) {
              sse.write({ status: 'error', error: errorInfo.message, code: errorInfo.code, requestId });
            }
          })
          .finally(() => {
            if (heartbeat) clearInterval(heartbeat);
            sse.close();
          });
      },
      cancel() {
        abortController.abort();
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
    logger.error(`[Generation ${requestId}] Failed to initialize`, { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: errorInfo.message, code: errorInfo.code, requestId }, { status: 500 });
  }
}
