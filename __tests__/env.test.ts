import { afterEach, describe, expect, test, vi } from 'vitest';

const originalOpenCodeKey = process.env.OPENCODE_API_KEY;
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalOpenCodeKey === undefined) delete process.env.OPENCODE_API_KEY;
  else process.env.OPENCODE_API_KEY = originalOpenCodeKey;
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  vi.resetModules();
});

describe('server environment', () => {
  test('allows provider keys to come from account BYOK settings', async () => {
    delete process.env.OPENCODE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    vi.resetModules();

    const { getServerEnv } = await import('@/lib/env');
    expect(() => getServerEnv()).not.toThrow();
  });
});
