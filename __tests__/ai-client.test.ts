import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('ai client', () => {
  test('getAIClient throws when GOOGLE_GENERATIVE_AI_API_KEY and GROQ_API_KEY is missing', async () => {
    const oldGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const oldGroq = process.env.GROQ_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/at least one AI provider/);
    } finally {
      if (oldGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = oldGoogle;
      if (oldGroq !== undefined) process.env.GROQ_API_KEY = oldGroq;
    }
  });
});
