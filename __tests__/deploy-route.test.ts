import { describe, test, expect, beforeAll, vi } from 'vitest';
import { POST } from '@/app/api/deploy/route';
import { stackServerApp } from '@/stack/server';

vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
}));

vi.mock('@/lib/integrations', () => ({
  getIntegrationTokens: vi.fn(),
}));

beforeAll(() => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID = 'stack-project';
  process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = 'stack-client';
  process.env.STACK_SECRET_SERVER_KEY = 'stack-secret';
  process.env.INTEGRATION_TOKEN_SECRET = '12345678901234567890123456789012';
});

describe('POST /api/deploy', () => {
  test('returns 401 when unauthenticated', async () => {
    vi.mocked(stackServerApp.getUser).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
