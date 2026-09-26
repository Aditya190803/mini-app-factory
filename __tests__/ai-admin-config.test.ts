import { describe, expect, test } from 'vitest';
import {
  DEFAULT_PROVIDER_MODELS,
  sanitizeAIAdminConfig,
  sanitizeCustomModelsConfig,
} from '@/lib/ai-admin-config';

describe('provider model restrictions', () => {
  test('keeps OpenCode free-only, drops retired providers, and fills gateway', () => {
    const config = sanitizeAIAdminConfig({
      providers: {
        opencode: {
          enabled: true,
          defaultModel: 'gpt-5.6-sol',
          customModels: ['gpt-5.6-sol', 'mimo-v2.5-free'],
          visibleModels: ['gpt-5.6-sol', 'big-pickle'],
        },
        google: { enabled: true, defaultModel: 'gemini-3-flash-preview' },
        openrouter: { enabled: true, defaultModel: 'openrouter/free' },
      },
      providerOrder: ['google', 'opencode', 'openrouter'],
    });

    expect(config.providerOrder).toEqual(['gateway', 'opencode']);
    expect(config.providers.opencode.defaultModel).toBe(DEFAULT_PROVIDER_MODELS.opencode);
    expect(config.providers.opencode.customModels).toEqual(['mimo-v2.5-free']);
    expect(config.providers.opencode.visibleModels).toEqual(['big-pickle']);
    expect(config.providers.gateway.defaultModel).toBe(DEFAULT_PROVIDER_MODELS.gateway);
    expect(config.providers.gateway.enabled).toBe(true);
    expect('google' in config.providers).toBe(false);
    expect('openrouter' in config.providers).toBe(false);

    expect(sanitizeCustomModelsConfig({
      opencode: ['gpt-5.6-sol', 'big-pickle'],
      openrouter: ['custom/model', 'openrouter/free'],
      gateway: ['claude-sonnet-4-6', 'tab_ghost'],
    })).toEqual({
      opencode: ['big-pickle'],
      gateway: ['claude-sonnet-4-6'],
    });
  });
});

describe('resolveSelectedAIModel', () => {
  test('accepts gateway and OpenCode free models', async () => {
    const { resolveSelectedAIModel } = await import('@/lib/ai-admin-config');
    expect(resolveSelectedAIModel('deepseek-v4-flash-free', 'opencode')).toEqual({
      model: 'deepseek-v4-flash-free',
      providerId: 'opencode',
    });
    expect(resolveSelectedAIModel('openrouter/free', 'opencode')).toBeUndefined();
    expect(resolveSelectedAIModel('claude-sonnet-4-6', 'gateway')).toEqual({
      model: 'claude-sonnet-4-6',
      providerId: 'gateway',
    });
    expect(resolveSelectedAIModel('tab_ghost', 'gateway')).toBeUndefined();
    expect(resolveSelectedAIModel('openrouter/free', 'openrouter')).toBeUndefined();
  });
});
