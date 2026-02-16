import { getAIClient } from './ai-client';
import { AI_MESSAGE_TIMEOUT_MS } from './constants';
import { logger } from './logger';

/**
 * Send a single message to the AI backend and return the response text.
 * Extracted from the transform route to be reusable across modules.
 */
export async function sendAIMessage(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = await getAIClient();
  const session = await client.createSession({
    systemMessage: { content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait(
      { prompt: userPrompt },
      AI_MESSAGE_TIMEOUT_MS
    );
    return response?.data?.content || '';
  } finally {
    await session.destroy().catch((err) => { logger.warn('session.destroy failed', { error: err instanceof Error ? err.message : String(err) }); });
  }
}
