import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PROVIDER_MODELS,
  sanitizeAIAdminConfig,
  sanitizeCustomModelsConfig,
} from '@/lib/ai-admin-config';

describe('OpenCode model restrictions', () => {
  test('keeps OpenCode free-only and removes retired providers', () => {
    const config = sanitizeAIAdminConfig({
      providers: {
        opencode: {
          enabled: true,
          defaultModel: 'gpt-5.6-sol',
          customModels: ['gpt-5.6-sol', 'mimo-v2.5-free'],
          visibleModels: ['gpt-5.6-sol', 'big-pickle'],
        },
        google: { enabled: true, defaultModel: 'gemini-3-flash-preview' },
      },
      providerOrder: ['google', 'opencode', 'openrouter'],
    });

    expect(config.providerOrder).toEqual(['opencode', 'openrouter']);
    expect(config.providers.opencode.defaultModel).toBe(DEFAULT_PROVIDER_MODELS.opencode);
    expect(config.providers.opencode.customModels).toEqual(['mimo-v2.5-free']);
    expect(config.providers.opencode.visibleModels).toEqual(['big-pickle']);
    expect('google' in config.providers).toBe(false);

    expect(sanitizeCustomModelsConfig({
      opencode: ['gpt-5.6-sol', 'big-pickle'],
      openrouter: ['custom/model', 'openrouter/free', 'z-ai/glm-5.2:free'],
    })).toEqual({
      opencode: ['big-pickle'],
      openrouter: ['openrouter/free', 'z-ai/glm-5.2:free'],
    });
  });

  test('replaces paid OpenRouter defaults with the free router', () => {
    const config = sanitizeAIAdminConfig({
      providers: {
        openrouter: {
          enabled: true,
          defaultModel: 'anthropic/claude-3.5-sonnet',
          customModels: ['openai/gpt-oss-120b', 'openrouter/free'],
          visibleModels: ['meta-llama/llama-3.3-70b-instruct'],
        },
      },
    });

    expect(config.providers.openrouter.defaultModel).toBe('openrouter/free');
    expect(config.providers.openrouter.customModels).toEqual(['openrouter/free']);
    expect(config.providers.openrouter.visibleModels).toEqual([]);
  });
});

describe('resolveSelectedAIModel', () => {
  test('accepts OpenRouter free models and rejects paid ones', async () => {
    const { resolveSelectedAIModel } = await import('@/lib/ai-admin-config');
    expect(resolveSelectedAIModel('openrouter/free', 'openrouter')).toEqual({
      model: 'openrouter/free',
      providerId: 'openrouter',
    });
    expect(resolveSelectedAIModel('z-ai/glm-5.2:free', 'openrouter')).toEqual({
      model: 'z-ai/glm-5.2:free',
      providerId: 'openrouter',
    });
    expect(resolveSelectedAIModel('anthropic/claude-3.5-sonnet', 'openrouter')).toBeUndefined();
    expect(resolveSelectedAIModel('deepseek-v4-flash-free', 'opencode')).toEqual({
      model: 'deepseek-v4-flash-free',
      providerId: 'opencode',
    });
    expect(resolveSelectedAIModel('openrouter/free', 'opencode')).toBeUndefined();
  });
});
