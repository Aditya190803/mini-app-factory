import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/convex-server', () => ({ getPublicConvexClient: () => ({ query }) }));

import { GET } from '@/app/api/health/ready/route';

beforeEach(() => {
  query.mockResolvedValue(null);
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
  vi.stubEnv('OPENCODE_API_KEY', '');
  vi.stubEnv('INTEGRATION_TOKEN_SECRET', 'x'.repeat(32));
});

afterEach(() => vi.unstubAllEnvs());

test('accepts a healthy BYOK-only deployment without platform AI keys', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, checks: { convex: true, secretKey: true } });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});

test('reports an unavailable database', async () => {
  query.mockRejectedValue(new Error('offline'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ checks: { convex: false } });
});

test('reports a missing encryption key', async () => {
  vi.stubEnv('INTEGRATION_TOKEN_SECRET', '');
  expect((await GET()).status).toBe(503);
});
