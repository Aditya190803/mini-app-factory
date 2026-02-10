import { z } from 'zod';
import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject, saveFiles } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { getAIClient, SessionEvent } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { ProjectFile, validateFileStructure } from '@/lib/page-builder';
import { getServerEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedDesignSpec, setCachedDesignSpec } from '@/lib/ai-cache';
import { withRetry } from '@/lib/ai-retry';

const MODEL = process.env.GOOGLE_MODEL || 'gemini-3-flash-preview';

const generateSchema = z.object({
  projectName: z.string().min(1),
  prompt: z.string().optional(),
});

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Creates a thread-safe SSE writer that gracefully handles stream destruction.
 * All writes are wrapped in try-catch and the closed state is tracked atomically.
 */
function createSSEWriter(controller: ReadableStreamDefaultController<Uint8Array>, signal?: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;

  const write = (data: object): boolean => {
    // Check if specifically closed or if the signal is aborted
    if (closed || signal?.aborted) {
      if (!closed) closed = true;
      return false;
    }

    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Stream might already be closed, errored, or cancelled
    }
  };

  const markClosed = () => { closed = true; };
  const isClosed = () => closed || !!signal?.aborted;

  return { write, close, markClosed, isClosed };
}

function classifyGenerationError(raw: unknown): { code: string; message: string } {
  try {
    const rawMsg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    const m = rawMsg.toLowerCase();

    if (m.includes('google_generative_ai_api_key') || m.includes('google api key') || m.includes('api_key')) {
      return {
        code: 'ENV_MISSING',
        message: 'Missing GOOGLE_GENERATIVE_AI_API_KEY. To enable AI features, set GOOGLE_GENERATIVE_AI_API_KEY in your environment or deployment variables and restart the server.'
      };
    }

    if (m.includes('google') || m.includes('gemini') || m.includes('provider returned') || m.includes('rate-limited')) {
      return {
        code: 'AI_PROVIDER_ERROR',
        message: 'AI provider error: the upstream model is temporarily unavailable or rate-limited. Check your GOOGLE_GENERATIVE_AI_API_KEY, switch providers, or try again shortly.'
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

/**
 * Runs the generation workflow, saving progress to the database.
 * The workflow continues even if the stream is closed - results are persisted.
 */
export async function runGeneration(
  projectName: string,
  finalPrompt: string,
  signal: AbortSignal,
  onEvent?: (event: SessionEvent) => void,
  requestId?: string
): Promise<{ html: string; files: ProjectFile[] } | { error: string }> {
  const project = await getProject(projectName);
  if (!project) return { error: 'Project not found during generation' };

  try {
    // Update status
    project.status = 'generating';
    await saveProject(project).catch(() => { });

    if (signal.aborted) return { error: 'Aborted' };

    const client = await getAIClient();

    if (signal.aborted) return { error: 'Aborted' };

    // Design phase
    const architectSystemMsg = 'You are an expert web design architect. Create a detailed design spec for the requested site.';

    const designSession = await client.createSession({
      model: project.selectedModel || MODEL,
      providerId: project.providerId,
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
        } else if (event.type === 'provider.fallback') {
          onEvent?.(event);
        }
      });

      try {
        const cacheKey = `${project.selectedModel || MODEL}:${project.providerId || ''}:${finalPrompt}`;
        const cached = getCachedDesignSpec(cacheKey);
        if (cached) {
          designSpec = cached;
        } else {
          const designResp = await withRetry(
            () => designSession.sendAndWait({ prompt: finalPrompt }, 120000),
            { maxAttempts: 3, baseDelayMs: 800 }
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

    if (signal.aborted) return { error: 'Aborted' };

    // HTML generation phase
    const developerSystemMsg = `You are an expert developer. Generate a complete multi-file website project. 
Return files using code blocks with the format:
\`\`\`html:filename.html
Code here...
\`\`\`

Mandatory requirements:
1. **Separation of Concerns**: ALWAYS put CSS in styles.css and JS in script.js. 
2. **No Inline Tags**: DO NOT use <style> or <script> tags inside HTML files.
3. **Linking**: index.html MUST include <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer></script>.
4. **Project Files**: Always include at least:
   - index.html (main landing page)
   - styles.css (common styles)
   - script.js (common interactions)

5. **Shared Partials (CRITICAL)**:
   - If the project has multiple pages, you MUST create a \`header.html\` (and \`footer.html\` if applicable).
   - DO NOT duplicate the header or footer HTML code inside individual page files.
   - Instead, use the placeholder \`<!-- include:header.html -->\` and \`<!-- include:footer.html -->\` in your HTML pages where they should appear.
   - Any shared code (navigation, branding, social links) MUST be moved to these partial files.

You can also create sub-pages (e.g. about.html, gallery.html).
Return ONLY code blocks. No explanations.`;

    const htmlSession = await client.createSession({
      model: project.selectedModel || MODEL,
      providerId: project.providerId,
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
        } else if (event.type === 'provider.fallback') {
          onEvent?.(event);
        }
      });

      try {
        const mainPrompt = buildMainPrompt(finalPrompt);
        const htmlResp = await withRetry(
          () => htmlSession.sendAndWait({
            prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}`
          }, 120000),
          { maxAttempts: 3, baseDelayMs: 800 }
        );
        if (sessionError) throw sessionError;
        
        const content = htmlResp?.data?.content || '';
        files = parseMultiFileOutput(content);
        
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

    const structure = validateFileStructure(files);
    if (!structure.valid) {
      return { error: `Invalid file structure: ${structure.errors.join(', ')}` };
    }

    // Always save the result to the database (even if client disconnected)
    const finalProject = await getProject(projectName);
    if (finalProject) {
      finalProject.html = html; // Keep for legacy / preview
      finalProject.status = 'completed';
      finalProject.isMultiPage = files.length > 1;
      finalProject.pageCount = files.filter(f => f.fileType === 'page').length;
      finalProject.description = designSpec.slice(0, 500); // Save partial spec as description
      
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

    const { prompt, projectName } = parsed.data;

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
    }

    const rateLimit = checkRateLimit({ key: `${user.id}:generate`, limit: 10, windowMs: 60_000 });
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

    const finalPrompt = prompt || project.prompt;

    // Use AbortController to signal cancellation to the generation workflow
    const abortController = new AbortController();

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
              }
            },
            requestId
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
            console.error(`[Generation ${requestId}] workflow error:`, err);
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
    console.error(`[Generation ${requestId}] Failed to initialize:`, error);
    return Response.json({ error: errorInfo.message, code: errorInfo.code, requestId }, { status: 500 });
  }
}
