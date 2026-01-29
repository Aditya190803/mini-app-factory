import { CopilotClient } from '@github/copilot-sdk';
import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject } from '@/lib/projects';

const MODEL = 'gpt-5-mini';

let clientInstance: CopilotClient | null = null;

async function getCopilotClient(): Promise<CopilotClient> {
  if (!clientInstance) {
    clientInstance = new CopilotClient();
    await clientInstance.start();
  }
  return clientInstance;
}

export async function POST(request: Request) {
  try {
    const { prompt, projectName } = await request.json();

    if (!projectName) {
      return Response.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await getProject(projectName);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const finalPrompt = prompt || project.prompt;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // Update status to generating
          project.status = 'generating';
          await saveProject(project);

          send({ status: 'initializing', message: 'Setting up production environment...' });
          await new Promise(r => setTimeout(r, 800));

          send({ status: 'designing', message: 'Architecting design system and components...' });
          const client = await getCopilotClient();
          
          const designSession = await client.createSession({
            model: MODEL,
            systemMessage: { content: 'You are an expert web design architect. Create a detailed design spec for the requested site.' },
          });
          
          const designResp = await designSession.sendAndWait({ prompt: finalPrompt }, 120000);
          const designSpec = designResp?.data?.content || '';
          await designSession.destroy();

          send({ status: 'fabricating', message: 'Fabricating production-ready HTML/Tailwind code...' });
          
          const htmlSession = await client.createSession({
            model: MODEL,
            systemMessage: { content: 'You are an expert developer. Generate a complete Tailwind CSS HTML file. Return ONLY code.' },
          });

          const mainPrompt = buildMainPrompt(finalPrompt);
          const htmlResp = await htmlSession.sendAndWait({ 
            prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}` 
          }, 120000);
          const rawHtml = htmlResp?.data?.content || '';
          const html = stripCodeFence(rawHtml);
          await htmlSession.destroy();

          // Finalize project
          project.html = html;
          project.status = 'completed';
          await saveProject(project);

          send({ status: 'completed', html });
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          project.status = 'error';
          project.error = errorMessage;
          await saveProject(project);
          send({ status: 'error', error: errorMessage });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    return Response.json({ error: 'Failed to initialize generation' }, { status: 500 });
  }
}
