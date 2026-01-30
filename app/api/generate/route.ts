import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { getAIClient } from '@/lib/ai-client';

const MODEL = process.env.OPENROUTER_MODEL || 'moonshotai/kimi-k2:free';

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

/**
 * Runs the generation workflow, saving progress to the database.
 * The workflow continues even if the stream is closed - results are persisted.
 */
export async function runGeneration(
  projectName: string,
  finalPrompt: string,
  signal: AbortSignal
): Promise<{ html: string } | { error: string }> {
  const project = await getProject(projectName);
  if (!project) return { error: 'Project not found during generation' };

  try {
    // Update status
    project.status = 'generating';
    await saveProject(project).catch(() => { });

    if (signal.aborted) return { error: 'Aborted' };

    const client = await getAIClient();

    // Design phase
    const designSession = await client.createSession({
      model: MODEL,
      systemMessage: { content: 'You are an expert web design architect. Create a detailed design spec for the requested site.' },
    });

    let designSpec = '';
    try {
      // Listen for session errors that might occur during send
      let sessionError: Error | null = null;
      const unsubscribe = designSession.on((event) => {
        if (event.type === 'session.error') {
          sessionError = new Error(event.data.message);
          console.error('[AI] Design session error:', event.data.message);
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
    const htmlSession = await client.createSession({
      model: MODEL,
      systemMessage: { content: 'You are an expert developer. Generate a complete Tailwind CSS HTML file. Return ONLY code.' },
    });

    let html = '';
    try {
      // Listen for session errors that might occur during send
      let sessionError: Error | null = null;
      const unsubscribe = htmlSession.on((event) => {
        if (event.type === 'session.error') {
          sessionError = new Error(event.data.message);
          console.error('[AI] HTML session error:', event.data.message);
        }
      });

      try {
        const mainPrompt = buildMainPrompt(finalPrompt);
        const htmlResp = await htmlSession.sendAndWait({
          prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}`
        }, 120000);
        if (sessionError) throw sessionError;
        html = stripCodeFence(htmlResp?.data?.content || '');
      } finally {
        unsubscribe();
      }
    } finally {
      await htmlSession.destroy().catch(() => { });
    }

    // Always save the result to the database (even if client disconnected)
    const finalProject = await getProject(projectName);
    if (finalProject) {
      finalProject.html = html;
      finalProject.status = 'completed';
      await saveProject(finalProject).catch(err => {
        console.error('Failed to save completed project:', err);
      });
    }

    return { html };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Save error state
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

          if (!sse.write({ status: 'designing', message: 'Architecting design system...' })) {
            return;
          }

          const result = await runGeneration(projectName, finalPrompt, abortController.signal);

          // Check stream state before any writes
          if (sse.isClosed()) return;

          if ('error' in result && result.error !== 'Aborted') {
            sse.write({ status: 'error', error: result.error });
          } else if ('html' in result) {
            // Double-check stream state before each write
            if (!sse.write({ status: 'fabricating', message: 'Finalizing...' })) return;
            await new Promise(r => setTimeout(r, 300));
            if (!sse.isClosed()) {
              sse.write({ status: 'completed', html: result.html });
            }
          }
        })()
          .catch((err) => {
            if (!sse.isClosed()) {
              sse.write({ status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
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
    return Response.json({ error: error instanceof Error ? error.message : 'Failed to initialize generation' }, { status: 500 });
  }
}
