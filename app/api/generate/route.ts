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

// Helper to run the generation workflow
async function runGeneration(
  projectName: string,
  finalPrompt: string,
  send: (data: any) => boolean,
  checkClosed: () => boolean
): Promise<void> {
  const project = await getProject(projectName);
  if (!project) throw new Error('Project not found during generation');

  // Update status to generating
  project.status = 'generating';
  try {
    await saveProject(project);
  } catch (err) {
    console.error('Failed to update status to generating:', err);
  }

  if (!send({ status: 'initializing', message: 'Setting up production environment...' })) return;
  if (checkClosed()) return;
  await new Promise(r => setTimeout(r, 800));

  if (!send({ status: 'designing', message: 'Architecting design system and components...' })) return;
  if (checkClosed()) return;
  
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
    await designSession.destroy().catch(() => {});
  }

  if (checkClosed()) return;
  if (!send({ status: 'fabricating', message: 'Fabricating production-ready HTML/Tailwind code...' })) return;
  
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
    await htmlSession.destroy().catch(() => {});
  }

  if (checkClosed()) return;

  // Finalize project
  const finalProject = await getProject(projectName);
  if (finalProject) {
    finalProject.html = html;
    finalProject.status = 'completed';
    try {
      await saveProject(finalProject);
    } catch (err) {
      console.error('Failed to save final project state:', err);
    }
  }

  send({ status: 'completed', html });
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
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Safe send function that returns false if stream is closed
        const send = (data: any): boolean => {
          if (isStreamClosed) return false;
          try {
            const chunk = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
            controller.enqueue(chunk);
            return true;
          } catch (error) {
            console.error('Stream write failed:', error instanceof Error ? error.message : 'Unknown');
            isStreamClosed = true;
            return false;
          }
        };

        const checkClosed = () => isStreamClosed;

        // Heartbeat to prevent gateway timeouts
        heartbeatInterval = setInterval(() => {
          if (!send({ status: 'ping' })) {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
          }
        }, 10000);

        // Run generation in the background
        runGeneration(projectName, finalPrompt, send, checkClosed)
          .catch(async (error) => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('Generation Error:', errorMessage);
            
            if (!isStreamClosed) {
              try {
                const proj = await getProject(projectName);
                if (proj) {
                  proj.status = 'error';
                  proj.error = errorMessage;
                  await saveProject(proj);
                }
              } catch (pErr) {
                console.error('Failed to save error status:', pErr);
              }
              send({ status: 'error', error: errorMessage });
            }
          })
          .finally(() => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            if (!isStreamClosed) {
              isStreamClosed = true;
              try {
                controller.close();
              } catch {
                // Stream already closed
              }
            }
          });
      },
      cancel() {
        isStreamClosed = true;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
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
