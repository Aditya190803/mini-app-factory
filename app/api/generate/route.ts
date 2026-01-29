import { CopilotClient } from '@github/copilot-sdk';
import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';

const MODEL = 'gpt-5-mini';

export const maxDuration = 300; // Extend to 5 minutes for generation
export const dynamic = 'force-dynamic';

let clientInstance: CopilotClient | null = null;
let clientPromise: Promise<CopilotClient> | null = null;

async function getCopilotClient(): Promise<CopilotClient> {
  if (clientInstance) return clientInstance;
  
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const client = new CopilotClient();
        await client.start();
        clientInstance = client;
        return client;
      } catch (error) {
        clientPromise = null;
        throw error;
      }
    })();
  }
  
  return clientPromise;
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

    const encoder = new TextEncoder();
    let isStreamClosed = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Safe send function to avoid "write after end" crashes
        const send = (data: any) => {
          if (isStreamClosed) return;
          try {
            const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
            controller.enqueue(chunk);
          } catch (error) {
            // This is where the "stream was destroyed" error is typically caught
            console.error('Stream write failed, closing:', error instanceof Error ? error.message : 'Unknown');
            isStreamClosed = true;
          }
        };

        // Heartbeat to prevent generic gateway timeouts (Vercel, Nginx, Cloudflare)
        const heartbeat = setInterval(() => {
          send({ status: 'ping' });
        }, 15000);

        try {
          // Update status to generating
          project.status = 'generating';
          try {
            await saveProject(project);
          } catch (err) {
            console.error('Failed to update status to generating:', err);
          }

          send({ status: 'initializing', message: 'Setting up production environment...' });
          if (isStreamClosed) return;
          await new Promise(r => setTimeout(r, 800));

          send({ status: 'designing', message: 'Architecting design system and components...' });
          if (isStreamClosed) return;
          
          const client = await getCopilotClient();
          const designSession = await client.createSession({
            model: MODEL,
            systemMessage: { content: 'You are an expert web design architect. Create a detailed design spec for the requested site.' },
          });
          
          let designSpec = '';
          try {
            const designResp = await designSession.sendAndWait({ prompt: finalPrompt }, 120000);
            designSpec = designResp?.data?.content || '';
          } finally {
            await designSession.destroy();
          }

          if (isStreamClosed) return;
          send({ status: 'fabricating', message: 'Fabricating production-ready HTML/Tailwind code...' });
          
          const htmlSession = await client.createSession({
            model: MODEL,
            systemMessage: { content: 'You are an expert developer. Generate a complete Tailwind CSS HTML file. Return ONLY code.' },
          });

          let html = '';
          try {
            const mainPrompt = buildMainPrompt(finalPrompt);
            const htmlResp = await htmlSession.sendAndWait({ 
              prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}` 
            }, 120000);
            const rawHtml = htmlResp?.data?.content || '';
            html = stripCodeFence(rawHtml);
          } finally {
            await htmlSession.destroy();
          }

          if (isStreamClosed) return;

          // Finalize project
          project.html = html;
          project.status = 'completed';
          try {
            await saveProject(project);
          } catch (err) {
            console.error('Failed to save final project state:', err);
          }

          send({ status: 'completed', html });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Generation Error Workflow:', errorMessage);
          
          if (!isStreamClosed) {
            project.status = 'error';
            project.error = errorMessage;
            try {
              await saveProject(project);
            } catch (pErr) {
              console.error('Failed to save error status:', pErr);
            }
            send({ status: 'error', error: errorMessage });
          }
        } finally {
          clearInterval(heartbeat);
          if (!isStreamClosed) {
            isStreamClosed = true;
            try {
              controller.close();
            } catch (err) {
              // Ignore errors during close on an already destroyed stream
            }
          }
        }
      },
      cancel() {
        isStreamClosed = true;
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    return Response.json({ error: 'Failed to initialize generation' }, { status: 500 });
  }
}
