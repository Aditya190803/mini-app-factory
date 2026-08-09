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
          customModels: ['gpt-5.6-sol', 'north-mini-code-free'],
          visibleModels: ['gpt-5.6-sol', 'big-pickle'],
        },
        google: { enabled: true, defaultModel: 'gemini-3-flash-preview' },
      },
      providerOrder: ['google', 'opencode', 'openrouter'],
    });

    expect(config.providerOrder).toEqual(['opencode', 'openrouter']);
    expect(config.providers.opencode.defaultModel).toBe(DEFAULT_PROVIDER_MODELS.opencode);
    expect(config.providers.opencode.customModels).toEqual(['north-mini-code-free']);
    expect(config.providers.opencode.visibleModels).toEqual(['big-pickle']);
    expect('google' in config.providers).toBe(false);

    expect(sanitizeCustomModelsConfig({
      opencode: ['gpt-5.6-sol', 'big-pickle'],
      openrouter: ['custom/model'],
    })).toEqual({
      opencode: ['big-pickle'],
      openrouter: ['custom/model'],
    });
  });
});
