import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('openrouter client', () => {
  test('getAIClient throws when OPENROUTER_API_KEY is missing', async () => {
    const old = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/OPENROUTER_API_KEY/);
    } finally {
      if (old !== undefined) process.env.OPENROUTER_API_KEY = old;
    }
  });
});
