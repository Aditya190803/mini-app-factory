import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('cerebras client', () => {
  test('getAIClient throws when CEREBRAS_API_KEY is missing', async () => {
    const old = process.env.CEREBRAS_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/any AI provider/);
    } finally {
      if (old !== undefined) process.env.CEREBRAS_API_KEY = old;
    }
  });
});
