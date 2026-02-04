import { describe, test, expect, beforeAll, vi } from 'vitest';
import { POST } from '@/app/api/transform/route';
import { stackServerApp } from '@/stack/server';

vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
  saveFiles: vi.fn(),
}));

beforeAll(() => {
  process.env.CEREBRAS_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID = 'stack-project';
  process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = 'stack-client';
  process.env.STACK_SECRET_SERVER_KEY = 'stack-secret';
  process.env.INTEGRATION_TOKEN_SECRET = '12345678901234567890123456789012';
});

describe('POST /api/transform', () => {
  test('returns 401 when unauthenticated', async () => {
    vi.mocked(stackServerApp.getUser).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', prompt: 'Update the hero' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid payload', async () => {
    const mockUser = { id: 'user_123' } as Awaited<ReturnType<typeof stackServerApp.getUser>>;
    vi.mocked(stackServerApp.getUser).mockResolvedValueOnce(mockUser);

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
