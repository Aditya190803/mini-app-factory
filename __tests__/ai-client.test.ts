import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('openrouter client', () => {
  test('getAIClient throws when OPENROUTER_API_KEY and GROQ_API_KEY is missing', async () => {
    const oldOpenRouter = process.env.OPENROUTER_API_KEY;
    const oldGroq = process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/at least one AI provider/);
    } finally {
      if (oldOpenRouter !== undefined) process.env.OPENROUTER_API_KEY = oldOpenRouter;
      if (oldGroq !== undefined) process.env.GROQ_API_KEY = oldGroq;
    }
  });
});
