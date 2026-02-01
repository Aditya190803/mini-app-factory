import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('cerebras client', () => {
  test('getAIClient throws when CEREBRAS_API_KEY and GROQ_API_KEY is missing', async () => {
    const oldCerebras = process.env.CEREBRAS_API_KEY;
    const oldGroq = process.env.GROQ_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/at least one AI provider/);
    } finally {
      if (oldCerebras !== undefined) process.env.CEREBRAS_API_KEY = oldCerebras;
      if (oldGroq !== undefined) process.env.GROQ_API_KEY = oldGroq;
    }
  });
});
