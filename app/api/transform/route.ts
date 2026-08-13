import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { claimProjectOrphan, getProject, getFiles } from '@/lib/projects';
import { canUserEditProject, isOrphanProject } from '@/lib/project-access';
import { getServerEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { isAIProviderId } from '@/lib/ai-admin-config';
import { getPersistedAISettings } from '@/lib/ai-settings-store';
import { createSSEWriter } from '@/lib/sse-writer';
import { runTransformWork, classifyTransformError } from '@/lib/transform-run';
import { normalizeFileType } from '@/lib/transform-files';
import type { ProjectFile } from '@/lib/page-builder';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true });
}

const transformSchema = z
  .object({
    projectName: z.string().trim().max(120).regex(/^[a-zA-Z0-9._-]+$/).optional(),
    html: z.string().max(2_000_000).optional(),
    prompt: z.string().trim().max(80_000).optional(),
    activeFile: z.string().trim().max(500).optional(),
    polishDescription: z.string().trim().max(8_000).optional(),
    modelId: z.string().trim().max(200).optional(),
    providerId: z.string().trim().max(50).optional(),
  })
  .strict()
  .refine((data) => data.projectName || data.html, {
    message: 'projectName or html is required',
  });

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    try {
      getServerEnv();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid environment configuration';
      return Response.json({ error: message, code: 'ENV_INVALID', requestId }, { status: 500 });
    }

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
    }

    const { getGlobalAdminModelConfig } = await import('@/lib/ai-settings-store');
    const globalAdminConfig = await getGlobalAdminModelConfig();
    const persistedSettings = await getPersistedAISettings();
    const runtimeConfig = {
      adminConfig: globalAdminConfig,
      byokConfig: persistedSettings.byokConfig,
    };
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON payload', code: 'INVALID_JSON', requestId }, { status: 400 });
    }
    const parsed = transformSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload', code: 'INVALID_PAYLOAD', requestId }, { status: 400 });
    }

    const rateLimit = checkRateLimit({ key: `${user.id}:transform`, limit: 20, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return Response.json(
        { error: 'Rate limit exceeded. Please wait before retrying.', code: 'RATE_LIMITED', retryAfter, requestId },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { projectName, html, prompt, activeFile, polishDescription, modelId, providerId } = parsed.data;

    const project = projectName ? await getProject(projectName) : null;
    if (projectName && !project) {
      return Response.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND', requestId }, { status: 404 });
    }
    if (project && !canUserEditProject(project, user.id)) {
      return Response.json({ error: 'Unauthorized to edit this project', code: 'FORBIDDEN', requestId }, { status: 403 });
    }
    if (project && isOrphanProject(project)) {
      try {
        await claimProjectOrphan(projectName!);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message === 'Project not found') {
          return Response.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND', requestId }, { status: 404 });
        }
        if (message === 'Unauthorized to edit this project') {
          return Response.json({ error: 'Unauthorized to edit this project', code: 'FORBIDDEN', requestId }, { status: 403 });
        }
        throw err;
      }
    }

    let finalFiles: ProjectFile[] = [];
    if (projectName) {
      const storedFiles = await getFiles(projectName);
      finalFiles = storedFiles.map((file) => ({
        path: file.path,
        content: file.content,
        language: file.language,
        fileType: normalizeFileType(file.fileType, file.path),
      }));
      if (finalFiles.length === 0 && project?.html) {
        finalFiles = [{ path: 'index.html', content: project.html, language: 'html', fileType: 'page' }];
      }
    } else if (html) {
      finalFiles = [{ path: 'index.html', content: html, language: 'html', fileType: 'page' } as ProjectFile];
    }

    const workInput = {
      requestId,
      projectName,
      html,
      prompt,
      activeFile,
      polishDescription,
      modelId,
      providerId: isAIProviderId(providerId) ? providerId : undefined,
      finalFiles,
      runtimeConfig,
    };

    const stream = new ReadableStream({
      start(controller) {
        const sse = createSSEWriter(controller, request.signal);
        (async () => {
          try {
            await runTransformWork({
              ...workInput,
              signal: request.signal,
              onEvent: (event) => {
                if (!sse.write(event)) return;
                if (event.status === 'complete' || event.status === 'error') sse.close();
              },
            });
          } catch (error) {
            const classified = classifyTransformError(error);
            const code =
              error && typeof error === 'object' && 'code' in error && typeof (error as { code: string }).code === 'string'
                ? (error as { code: string }).code
                : classified.code;
            console.error(`[Transform ${requestId}] error:`, error);
            sse.write({ status: 'error', error: classified.message, code, requestId });
            sse.close();
          }
        })();
      },
      cancel() {
        /* client disconnected; runTransformWork checks request.signal */
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const classified = classifyTransformError(error);
    console.error(`[Transform ${requestId}] error:`, error);
    return Response.json({ error: classified.message, code: classified.code, requestId }, { status: 500 });
  }
}
