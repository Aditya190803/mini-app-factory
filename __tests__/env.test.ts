import { afterEach, describe, expect, test, vi } from 'vitest';

const originalOpenCodeKey = process.env.OPENCODE_API_KEY;
const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;

afterEach(() => {
  if (originalOpenCodeKey === undefined) delete process.env.OPENCODE_API_KEY;
  else process.env.OPENCODE_API_KEY = originalOpenCodeKey;
  if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
  vi.resetModules();
});

describe('server environment', () => {
  test('allows provider keys to come from account BYOK settings', async () => {
    delete process.env.OPENCODE_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    vi.resetModules();

    const { getServerEnv } = await import('@/lib/env');
    expect(() => getServerEnv()).not.toThrow();
  });
});

describe('paired credentials', () => {
  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });

  test('rejects half-configured OAuth credentials', async () => {
    process.env.GITHUB_CLIENT_ID = 'id-only';
    delete process.env.GITHUB_CLIENT_SECRET;
    vi.resetModules();
    const { getServerEnv } = await import('@/lib/env');
    expect(() => getServerEnv()).toThrow(/GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together/);
  });
});
