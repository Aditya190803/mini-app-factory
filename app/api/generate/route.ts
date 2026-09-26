import { z } from 'zod';
import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { assertCanAccessProject } from '@/lib/project-access';
import { getProject, saveProject, saveFiles } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { getAIClient, SessionEvent } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { ProjectFile } from '@/lib/page-builder';
import { getServerEnv } from '@/lib/env';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getCachedDesignSpec, setCachedDesignSpec } from '@/lib/ai-cache';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import { resolveSelectedAIModel } from '@/lib/ai-admin-config';
import { resolveOpenCodeModel } from '@/lib/opencode-models';
import { resolveGatewayModel } from '@/lib/gateway-models';
import { getPersistedAISettings, getGlobalAdminModelConfig } from '@/lib/ai-settings-store';
import { appendReferenceUrlToPrompt } from '@/lib/resolve-reference-url';
import { createSSEWriter } from '@/lib/sse-writer';
import { validateGeneratedProject } from '@/lib/generated-project-validation';
import { appendProjectMessage, appendProjectRunEvent, createProjectRun, createProjectVersion, finishProjectRun, isProjectRunCancelled } from '@/lib/project-runs';

const MODEL = process.env.AI_GATEWAY_MODEL || process.env.OPENCODE_MODEL || 'claude-sonnet-4-6';

const generateSchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid project name'),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  referenceUrl: z.string().trim().max(2048).optional(),
}).strict();

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function classifyGenerationError(raw: unknown): { code: string; message: string } {
  try {
    const rawMsg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    const m = rawMsg.toLowerCase();

    if (
      m.includes('at least one ai provider key') ||
      m.includes('no enabled provider with a valid key') ||
      m.includes('missing ai provider key')
    ) {
      return {
        code: 'ENV_MISSING',
        message: 'Missing AI provider key. Set AI_GATEWAY_API_KEY or OPENCODE_API_KEY and restart the server.'
      };
    }

    if (/authentication failed|unauthorized|invalid.*api key|\b401\b|\b403\b/.test(m)) {
      return {
        code: 'AI_AUTH_ERROR',
        message: 'The AI provider rejected the configured key. Replace it in Settings or .env.local and try again.'
      };
    }

    if (m.includes('opencode') || m.includes('gateway') || m.includes('provider returned') || m.includes('rate-limited')) {
      return {
        code: 'AI_PROVIDER_ERROR',
        message: 'The AI provider is unavailable or rate-limited. Check your provider key, switch providers, or try again shortly.'
      };
    }

    if (/timeout|timed out/.test(m)) return { code: 'AI_TIMEOUT', message: 'AI request timed out. Try again.' };
    if (/network|enotfound|eai_again|econnrefused|econnreset/.test(m)) {
      return { code: 'AI_NETWORK_ERROR', message: 'Network error contacting AI provider. Ensure server can reach the provider and try again.' };
    }

    // Default to the raw string but keep it concise
    const concise = rawMsg.length > 800 ? rawMsg.slice(0, 800) + '…' : rawMsg;
    return { code: 'AI_ERROR', message: concise };
  } catch {
    return { code: 'AI_ERROR', message: 'Unknown error contacting AI provider' };
  }
}

/** Keep the activity feed alive while a long model call is in flight. */
async function waitWithProgress<T>(
  work: Promise<T>,
  onProgress: ((event: { status: string; message: string; path?: string }) => void) | undefined,
  status: string,
  baseMessage: string,
  intervalMs = 12_000,
): Promise<T> {
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    onProgress?.({
      status,
      message: `${baseMessage} (${ticks * (intervalMs / 1000)}s)`,
    });
  }, intervalMs);
  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}

/**
 * Runs the generation workflow, saving progress to the database.
 * The workflow continues even if the stream is closed - results are persisted.
 */
export async function runGeneration(
  projectName: string,
  finalPrompt: string,
  signal: AbortSignal,
  onEvent?: (event: SessionEvent) => void,
  requestId?: string,
  runtimeConfig?: AIRuntimeConfig,
  onProgress?: (event: { status: string; message: string; path?: string }) => void,
  shouldCancel?: () => Promise<boolean>
): Promise<{ html: string; files: ProjectFile[] } | { error: string }> {
  const project = await getProject(projectName);
  if (!project) return { error: 'Project not found during generation' };

  try {
    // Update status. Honor the model the user picked in the selector; only fall
    // back to the OpenCode default when nothing valid was stored on the project.
    const requested = resolveSelectedAIModel(project.selectedModel, project.providerId);
    const liveModel = requested?.providerId === 'gateway'
      ? await resolveGatewayModel(requested.model)
      : requested?.providerId === 'opencode'
        ? await resolveOpenCodeModel(requested.model)
        : requested?.model;
    project.status = 'generating';
    if (requested) {
      project.selectedModel = liveModel ?? requested.model;
      project.providerId = requested.providerId;
    }
    await saveProject(project).catch(() => { });

    if (signal.aborted || await shouldCancel?.()) return { error: 'Aborted' };

    const client = await getAIClient(runtimeConfig);
    const selectedModel = liveModel ?? requested?.model;
    const selectedProviderId = requested?.providerId;

    if (signal.aborted || await shouldCancel?.()) return { error: 'Aborted' };

    onProgress?.({ status: 'planning', message: 'Planning the app UI, data, and any backend' });
    const architectSystemMsg = 'You are an expert product engineer. Spec the real working app: screens, data, and interactions people use. Never spec a marketing landing page, hero+CTA brochure, or empty About/Pricing pages.';

    const designSession = await client.createSession({
      model: selectedModel,
      providerId: selectedProviderId,
      systemMessage: { content: architectSystemMsg },
    });

    let designSpec = '';
    try {
      // Listen for session errors that might occur during send
      let sessionError: Error | null = null;
      const unsubscribe = designSession.on((event) => {
        if (event.type === 'session.error') {
          sessionError = new Error(event.data.message);
          console.error('[AI] Design session error:', event.data.message);
        } else if (event.type === 'provider.fallback' || event.type === 'provider.selected') {
          onEvent?.(event);
        }
      });

      try {
        const cacheKey = `${selectedModel || MODEL}:${selectedProviderId || 'auto'}:${finalPrompt}`;
        const cached = getCachedDesignSpec(cacheKey);
        if (cached) {
          designSpec = cached;
        } else {
          const designResp = await waitWithProgress(
            designSession.sendAndWait({
              prompt: `Spec a working application for this request. Include the primary UI, data, and interactions. Do not spec a marketing site.\n\nRequest:\n${finalPrompt}`,
              maxOutputTokens: 1600,
            }, 60000),
            onProgress,
            'planning',
            'Planning the app UI, data, and any backend',
          );
          if (sessionError) throw sessionError;
          designSpec = designResp?.data?.content || '';
          if (designSpec) setCachedDesignSpec(cacheKey, designSpec);
        }
      } finally {
        unsubscribe();
      }
    } finally {
      await designSession.destroy().catch(() => { });
    }

    if (signal.aborted || await shouldCancel?.()) return { error: 'Aborted' };

    onProgress?.({ status: 'generating', message: 'Generating the project files' });
    // HTML generation phase
    const developerSystemMsg = `You are an expert developer. Generate a complete multi-file web APPLICATION (not a marketing landing page).
Return files using code blocks with the format:
\`\`\`html:filename.html
Code here...
\`\`\`
Use \`javascript:_worker.js\` for a Cloudflare backend, \`jsonc:wrangler.jsonc\` for Cloudflare configuration, and \`sql:migrations/0001_init.sql\` for D1 migrations.

Mandatory requirements:
1. **Product first**: Ship the actual tool UI the user asked for (forms, tables, charts, filters, CRUD). A hero+CTA brochure with no working app is a failure.
2. **Separation of Concerns**: ALWAYS put CSS in styles.css and JS in script.js.
3. **No Inline Tags**: DO NOT use <style> or <script> tags inside HTML files.
4. **Linking**: index.html MUST include <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer></script>.
5. **Required files** (never omit):
   - index.html (app shell / primary UI)
   - styles.css (complete non-empty stylesheet)
   - script.js (working client logic; use localStorage when no backend is needed)
6. **Shared Partials**: Only split header.html / footer.html when there are multiple real app views sharing chrome. Do not invent About/Pricing/Features pages.
7. **Link Integrity**: No dead "#" links. Only link to files you also generate, or same-page anchors. Relative paths only (about.html, never /about.html).
8. **Cloudflare Backend** when the product needs shared APIs, auth, or persistence beyond localStorage:
   - One import-free \`_worker.js\` with \`export default { async fetch(request, env) { ... } }\`.
   - Fall through with \`return env.ASSETS.fetch(request)\`.
   - Generate \`wrangler.jsonc\` (main: _worker.js). Never invent resource IDs.
   - D1 via env.DB + additive migrations/ SQL when relational data is needed.
   - Match frontend fetch calls to real /api/* routes. Include GET /api/health.

Return ONLY code blocks. No explanations.`;

    const htmlSession = await client.createSession({
      model: selectedModel,
      providerId: selectedProviderId,
      systemMessage: { content: developerSystemMsg },
    });

    let html = '';
    let files: ProjectFile[] = [];
    try {
      // Listen for session errors that might occur during send
      let sessionError: Error | null = null;
      const unsubscribe = htmlSession.on((event) => {
        if (event.type === 'session.error') {
          sessionError = new Error(event.data.message);
          console.error('[AI] HTML session error:', event.data.message);
        } else if (event.type === 'provider.fallback' || event.type === 'provider.selected') {
          onEvent?.(event);
        }
      });

      try {
        const mainPrompt = buildMainPrompt(finalPrompt);
        const htmlResp = await waitWithProgress(
          htmlSession.sendAndWait({
            prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}`,
            maxOutputTokens: 8000,
          }, 120000),
          onProgress,
          'generating',
          'Generating the project files',
        );
        if (sessionError) throw sessionError;
        
        const content = htmlResp?.data?.content || '';
        files = parseMultiFileOutput(content);
        for (const file of files) {
          onProgress?.({ status: 'file', message: `Created ${file.path}`, path: file.path });
        }
        
        if (files.length === 0) {
          // Fallback if no code fences found
          html = stripCodeFence(content);
          files = [{ path: 'index.html', content: html, language: 'html', fileType: 'page' }];
        } else {
          // Find index.html for legacy compatibility
          html = files.find(f => f.path === 'index.html')?.content || '';
        }
      } finally {
        unsubscribe();
      }
    } finally {
      await htmlSession.destroy().catch(() => { });
    }

    onProgress?.({ status: 'validating', message: 'Validating project structure, Worker routes, migrations, and Wrangler configuration' });
    if (signal.aborted || await shouldCancel?.()) return { error: 'Aborted' };
    let validation = validateGeneratedProject(files, projectName);
    if (!validation.valid) {
      onProgress?.({ status: 'repairing', message: `Repairing ${validation.errors.length} validation issue${validation.errors.length === 1 ? '' : 's'}` });
      const repairSession = await client.createSession({
        model: selectedModel,
        providerId: selectedProviderId,
        systemMessage: { content: developerSystemMsg },
      });
      try {
        const currentFiles = files.map((file) => `\n\`\`\`${file.language}:${file.path}\n${file.content}\n\`\`\``).join('');
        const repair = await repairSession.sendAndWait({
          prompt: `The generated project failed validation:\n- ${validation.errors.join('\n- ')}\n\nReturn the complete corrected project as code blocks. Preserve the requested product and fix every listed issue.\n${currentFiles}`,
          maxOutputTokens: 8000,
        }, 120_000);
        const repairedFiles = parseMultiFileOutput(repair?.data?.content || '');
        if (repairedFiles.length > 0) files = repairedFiles;
      } finally {
        await repairSession.destroy().catch(() => {});
      }
      validation = validateGeneratedProject(files, projectName);
    }
    if (!validation.valid) return { error: `Generated project validation failed: ${validation.errors.join('; ')}` };
    onProgress?.({ status: 'validation', message: `All generated-project checks passed${validation.warnings.length ? ` with ${validation.warnings.length} warning(s)` : ''}` });

    onProgress?.({ status: 'saving', message: 'Saving the project and creating its first version' });
    // Always save the result to the database (even if client disconnected)
    const finalProject = await getProject(projectName);
    if (finalProject) {
      finalProject.html = html; // Keep for legacy / preview
      finalProject.status = 'completed';
      finalProject.isMultiPage = files.length > 1;
      finalProject.pageCount = files.filter(f => f.fileType === 'page').length;
      finalProject.description = designSpec.slice(0, 500);
      
      await saveProject(finalProject).catch(err => {
        console.error('Failed to save completed project:', err);
      });
      
      if (files.length > 0) {
        await saveFiles(projectName, files).catch(err => {
          console.error('Failed to save project files:', err);
        });
      }
    }

    return { html, files };
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    const errorInfo = classifyGenerationError(original);

    // Log original for debugging, save sanitized to project state
    console.error(`[Generation ${requestId ?? 'unknown'}] error for`, projectName, ':', original);

    try {
      const proj = await getProject(projectName);
      if (proj) {
        proj.status = 'error';
        proj.error = errorInfo.message;
        await saveProject(proj);
      }
    } catch { /* ignore */ }

    return { error: errorInfo.message };
  }
}

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

    const rateLimit = await consumeRateLimit('generate', user.id);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return Response.json(
        { error: 'Rate limit exceeded. Please wait before retrying.', code: 'RATE_LIMITED', retryAfter, requestId },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const projectRecord = await getProject(projectName);
    const access = assertCanAccessProject(projectRecord, user.id);
    if (!access.ok) {
      const code = access.status === 404 ? 'PROJECT_NOT_FOUND' : access.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
      return Response.json({ error: access.message, code, requestId }, { status: access.status });
    }
    const project = access.project;

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
    const { runId, projectId } = await createProjectRun(projectName, 'initial', basePrompt);
    await appendProjectMessage(projectName, 'user', basePrompt);

    // Use AbortController to signal cancellation to the generation workflow
    const abortController = new AbortController();
    const globalAdminConfig = await getGlobalAdminModelConfig();
    const persistedSettings = await getPersistedAISettings();
    const runtimeConfig: AIRuntimeConfig = {
      adminConfig: globalAdminConfig,
      byokConfig: persistedSettings.byokConfig,
    };

    // A disconnected browser must not destroy a build. The durable run record lets the UI recover.

    let sse: ReturnType<typeof createSSEWriter>;

    const stream = new ReadableStream({
      start(controller) {
        sse = createSSEWriter(controller, abortController.signal);
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        // Start heartbeat immediately
        heartbeat = setInterval(() => {
          if (sse.isClosed()) {
            if (heartbeat) clearInterval(heartbeat);
            return;
          }
          if (!sse.write({ status: 'ping' })) {
            if (heartbeat) clearInterval(heartbeat);
          }
        }, 8000);

        // Send initial status
        const persistEvent = (type: string, message: string, path?: string) => {
          void appendProjectRunEvent({ projectId, runId, type, message, path }).catch((error) => {
            console.error(`[Generation ${requestId}] failed to persist event:`, error);
          });
        };
        persistEvent('started', 'Build started');
        if (!sse.write({ status: 'started', message: 'Build started', requestId, runId })) {
          if (heartbeat) clearInterval(heartbeat);
        }

        // Run the generation
        (async () => {
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
            runtimeConfig,
            (event) => {
              persistEvent(event.status, event.message, event.path);
              sse.write({ ...event, runId });
            },
            () => isProjectRunCancelled(projectId, runId)
          );

          if ('error' in result && result.error !== 'Aborted') {
            const errorInfo = classifyGenerationError(result.error);
            persistEvent('error', errorInfo.message);
            await finishProjectRun({ projectId, runId, status: 'failed', errorCode: errorInfo.code, errorMessage: errorInfo.message });
            await appendProjectMessage(projectName, 'system', `Build failed: ${errorInfo.message}`, 'failed');
            sse.write({ status: 'error', error: errorInfo.message, code: errorInfo.code, requestId });
          } else if ('html' in result) {
            persistEvent('completed', `Created ${result.files.length} project files`);
            await finishProjectRun({ projectId, runId, status: 'completed' });
            const messageId = await appendProjectMessage(projectName, 'assistant', `Built the initial project with ${result.files.length} files.`, 'completed', JSON.stringify({ files: result.files.map((file) => file.path) }));
            await createProjectVersion(projectName, 'Initial build', JSON.stringify(result.files), messageId);
            if (!sse.isClosed()) {
              // Keep the SSE payload small. Huge file bodies used to stall the
              // browser parser and leave the UI stuck on the last progress event.
              // The editor loads files from Convex after status flips to completed.
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
            }
          }
        })()
          .catch((err) => {
            const errorInfo = classifyGenerationError(err instanceof Error ? err.message : err);
            console.error(`[Generation ${requestId}] workflow error:`, err);
            void finishProjectRun({ projectId, runId, status: 'failed', errorCode: errorInfo.code, errorMessage: errorInfo.message });
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
    console.error(`[Generation ${requestId}] Failed to initialize:`, error);
    return Response.json({ error: errorInfo.message, code: errorInfo.code, requestId }, { status: 500 });
  }
}
