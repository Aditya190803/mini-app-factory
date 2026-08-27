import { describe, expect, test, vi } from 'vitest';

const generateText = vi.fn().mockResolvedValue({ text: 'ok' });

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => (modelId: string) => ({ modelId })),
}));
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => (modelId: string) => ({ modelId })),
}));
vi.mock('ai', () => ({
  generateText,
  streamText: vi.fn(),
}));

describe('OpenCode generation options', () => {
  test('disables reasoning and forwards the phase output limit', async () => {
    const { getAIClient } = await import('@/lib/ai-client');
    const client = await getAIClient({
      adminConfig: {
        providers: {
          opencode: {
            enabled: true,
            defaultModel: 'deepseek-v4-flash-free',
            customModels: [],
            visibleModels: [],
          },
          openrouter: {
            enabled: false,
            defaultModel: 'openrouter/free',
            customModels: [],
            visibleModels: [],
          },
        },
        providerOrder: ['opencode', 'openrouter'],
      },
      byokConfig: { opencode: 'test-key' },
    });

    const session = await client.createSession();
    await session.sendAndWait({ prompt: 'Build a site', maxOutputTokens: 1600 });

    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 1600,
      providerOptions: {
        opencode: { reasoningEffort: 'none', textVerbosity: 'low' },
      },
    }));
  });

  test('sends the selected OpenRouter free model instead of the OpenCode default', async () => {
    generateText.mockClear();
    const { getAIClient } = await import('@/lib/ai-client');
    const client = await getAIClient({
      adminConfig: {
        providers: {
          opencode: {
            enabled: true,
            defaultModel: 'deepseek-v4-flash-free',
            customModels: [],
            visibleModels: [],
          },
          openrouter: {
            enabled: true,
            defaultModel: 'openrouter/free',
            customModels: [],
            visibleModels: [],
          },
        },
        providerOrder: ['opencode', 'openrouter'],
      },
      byokConfig: { opencode: 'opencode-key', openrouter: 'openrouter-key' },
    });

    const session = await client.createSession({
      model: 'z-ai/glm-5.2:free',
      providerId: 'openrouter',
    });
    await session.sendAndWait({ prompt: 'Build a site' });

    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: { modelId: 'z-ai/glm-5.2:free' },
    }));
  });
});
