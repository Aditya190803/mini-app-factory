import { describe, expect, test, vi } from 'vitest';

const generateText = vi.fn().mockResolvedValue({ text: 'ok' });

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => (modelId: string) => ({ modelId })),
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
          gateway: {
            enabled: false,
            defaultModel: 'claude-sonnet-4-6',
            customModels: [],
            visibleModels: [],
          },
          opencode: {
            enabled: true,
            defaultModel: 'deepseek-v4-flash-free',
            customModels: [],
            visibleModels: [],
          },
        },
        providerOrder: ['gateway', 'opencode'],
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

  test('sends the selected gateway model through the OpenAI-compatible client', async () => {
    generateText.mockClear();
    process.env.AI_GATEWAY_BASE_URL = 'https://ai-gateway.example/v1';
    const { getAIClient } = await import('@/lib/ai-client');
    const client = await getAIClient({
      adminConfig: {
        providers: {
          gateway: {
            enabled: true,
            defaultModel: 'claude-sonnet-4-6',
            customModels: [],
            visibleModels: [],
          },
          opencode: {
            enabled: false,
            defaultModel: 'deepseek-v4-flash-free',
            customModels: [],
            visibleModels: [],
          },
        },
        providerOrder: ['gateway', 'opencode'],
      },
      byokConfig: { gateway: 'gateway-key' },
    });

    const session = await client.createSession({
      model: 'claude-sonnet-4-6',
      providerId: 'gateway',
    });
    await session.sendAndWait({ prompt: 'Build a site' });

    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: { modelId: 'claude-sonnet-4-6' },
    }));
  });
});
