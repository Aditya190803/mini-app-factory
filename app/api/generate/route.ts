import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject, saveFiles } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { getAIClient, SessionEvent } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { ProjectFile } from '@/lib/page-builder';

const MODEL = process.env.CEREBRAS_MODEL || 'zai-glm-4.7';

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

function sanitizeErrorMessage(raw: unknown): string {
  try {
    const rawMsg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    const m = rawMsg.toLowerCase();

    if (m.includes('cerebras_api_key') || m.includes('cerebras api key') || m.includes('cerebras_api_key'.toLowerCase())) {
      return 'Missing CEREBRAS_API_KEY. To enable AI features, set CEREBRAS_API_KEY in your environment or deployment variables and restart the server.';
    }

    if (m.includes('cerebras') || m.includes('provider returned') || m.includes('rate-limited') || m.includes('glm') || m.includes('openinference')) {
      return 'AI provider error: the upstream model is temporarily unavailable or rate-limited. Add your CEREBRAS_API_KEY, switch providers, or try again shortly.';
    }

    if (/timeout|timed out/.test(m)) return 'AI request timed out. Try again.';
    if (/network|enotfound|eai_again|econnrefused|econnreset/.test(m)) return 'Network error contacting AI provider. Ensure server can reach the provider and try again.';

    // Default to the raw string but keep it concise
    return rawMsg.length > 800 ? rawMsg.slice(0, 800) + '…' : rawMsg;
  } catch {
    return 'Unknown error contacting AI provider';
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
  onEvent?: (event: SessionEvent) => void
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
        const designResp = await designSession.sendAndWait({ prompt: finalPrompt }, 120000);
        if (sessionError) throw sessionError;
        designSpec = designResp?.data?.content || '';
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
        const htmlResp = await htmlSession.sendAndWait({
          prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}`
        }, 120000);
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
    const errorMessage = sanitizeErrorMessage(original);

    // Log original for debugging, save sanitized to project state
    console.error('[Generation] error for', projectName, ':', original);

    try {
      const proj = await getProject(projectName);
      if (proj) {
        proj.status = 'error';
        proj.error = errorMessage;
        await saveProject(proj);
      }
    } catch { /* ignore */ }

    return { error: errorMessage };
  }
}

export async function POST(request: Request) {
  try {
    const { prompt, projectName } = await request.json();

    if (!projectName) {
      return Response.json({ error: 'Project name is required' }, { status: 400 });
    }

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const project = await getProject(projectName);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.userId && project.userId !== user.id) {
      return Response.json({ error: 'Unauthorized to edit this project' }, { status: 403 });
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
            }
          );

          // Check stream state before any writes
          if (sse.isClosed()) return;

          if ('error' in result && result.error !== 'Aborted') {
            sse.write({ status: 'error', error: result.error });
          } else if ('html' in result) {
            // Double-check stream state before each write
            if (!sse.write({ status: 'fabricating', message: 'Fabricating production code...' })) return;
            await new Promise(r => setTimeout(r, 300));
            if (!sse.write({ status: 'finalizing', message: 'Polishing and optimizing...' })) return;
            await new Promise(r => setTimeout(r, 300));
            if (!sse.isClosed()) {
              sse.write({ status: 'completed', html: result.html, files: result.files });
            }
          }
        })()
          .catch((err) => {
            const sanitized = sanitizeErrorMessage(err instanceof Error ? err.message : err);
            console.error('Generation workflow error:', err);
            if (!sse.isClosed()) {
              sse.write({ status: 'error', error: sanitized });
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
    const msg = sanitizeErrorMessage(error instanceof Error ? error.message : error);
    console.error('Failed to initialize generation:', error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
