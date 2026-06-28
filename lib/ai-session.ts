import { getAIClient } from '@/lib/ai-client';

/** One-shot AI completion (transform polish helpers, etc.). */
export async function sendAIMessage(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = await getAIClient();
  const session = await client.createSession({
    systemMessage: { content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait({ prompt: userPrompt }, 120000);
    return response?.data?.content || '';
  } finally {
    await session.destroy().catch(() => {});
  }
}