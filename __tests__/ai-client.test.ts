import { describe, test, expect } from 'vitest';
import { getAIClient } from '@/lib/ai-client';

describe('ai client', () => {
  test('getAIClient throws when no provider keys are set', async () => {
    const saved = {
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
    };
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    try {
      await expect(getAIClient()).rejects.toThrow(/at least one AI provider/i);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value !== undefined) process.env[key] = value;
      }
    }
  });
});
