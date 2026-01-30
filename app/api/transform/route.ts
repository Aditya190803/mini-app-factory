import { CopilotClient } from '@github/copilot-sdk';
import { z } from 'zod';
import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';

const MODEL = 'gpt-5-mini';

export const maxDuration = 300;
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

async function sendCopilotMessage(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = await getCopilotClient();
  const session = await client.createSession({
    model: MODEL,
    systemMessage: { content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait({ prompt: userPrompt }, 120000);
    return response?.data?.content || '';
  } finally {
    await session.destroy().catch(() => {});
  }
}

const transformSchema = z.object({
  html: z.string(),
  prompt: z.string().optional(),
  polishDescription: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = transformSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { html, prompt, polishDescription } = parsed.data;

    const systemMessage = `You are an expert web developer. You will be given a complete HTML file and a user's modification request. Return ONLY the full updated HTML file (no commentary, no extra text). Preserve any important semantics and accessibility. Make minimal changes to satisfy the request and ensure the result is a complete, valid HTML file. If images are needed, use placeholder images.`;

    let userMessage: string;
    if (polishDescription && !prompt) {
      const polishPrompt = buildPolishPrompt(polishDescription);
      userMessage = `${polishPrompt}\n\nCurrent HTML:\n\n${html}`;
    } else {
      userMessage = `Current HTML:\n\n${html}\n\nModification Request:\n\n${prompt || ''}`;
    }

    const rawHtml = await sendCopilotMessage(systemMessage, userMessage);
    const newHtml = stripCodeFence(rawHtml);

    return Response.json({ html: newHtml });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to transform site';
    console.error('[v0] Transform error:', error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
