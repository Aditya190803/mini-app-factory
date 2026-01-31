import { z } from 'zod';
import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';
import { getAIClient } from '@/lib/ai-client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Health check so clients can verify the endpoint is available without invoking the AI backend
export async function GET() {
  return Response.json({ ok: true });
}

export async function sendAIMessage(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = await getAIClient();
  const session = await client.createSession({
    systemMessage: { content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait({ prompt: userPrompt }, 120000);
    return response?.data?.content || '';
  } finally {
    await session.destroy().catch(() => { });
  }
}

const transformSchema = z.object({
  html: z.string(),
  prompt: z.string().optional(),
  polishDescription: z.string().optional(),
});

const encoder = new TextEncoder();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = transformSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { html, prompt, polishDescription } = parsed.data;

    const client = await getAIClient();
    const systemMessage = `You are an expert web developer. You will be given a complete HTML file and a user's modification request. Return ONLY the full updated HTML file (no commentary, no extra text). Preserve any important semantics and accessibility. Make minimal changes to satisfy the request and ensure the result is a complete, valid HTML file. If images are needed, use placeholder images.`;

    let userMessage: string;
    if (polishDescription && !prompt) {
      const polishPrompt = buildPolishPrompt(polishDescription);
      userMessage = `${polishPrompt}\n\nCurrent HTML:\n\n${html}`;
    } else {
      userMessage = `Current HTML:\n\n${html}\n\nModification Request:\n\n${prompt || ''}`;
    }

    const session = await client.createSession({
      systemMessage: { content: systemMessage },
    });

    const textStream = await session.stream({ prompt: userMessage });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error('Stream error:', err);
        } finally {
          controller.close();
          await session.destroy().catch(() => { });
        }
      },
      cancel() {
        session.destroy().catch(() => { });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to transform site';
    console.error('Transform error:', error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
