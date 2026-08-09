import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/exa-url-context', () => ({
  fetchExaUrlContext: vi.fn(),
}));

beforeAll(() => {
  process.env.OPENCODE_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID = 'stack-project';
  process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = 'stack-client';
  process.env.STACK_SECRET_SERVER_KEY = 'stack-secret';
  process.env.INTEGRATION_TOKEN_SECRET = '12345678901234567890123456789012';
  process.env.EXA_API_KEY = 'exa-test-key';
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/url-context', () => {
  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/url-context/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await POST(
      new Request('http://localhost/api/url-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
      })
    );
    expect(res.status).toBe(401);
  });

  test('returns context when authenticated', async () => {
    const { POST } = await import('@/app/api/url-context/route');
    const { stackServerApp } = await import('@/stack/server');
    const { fetchExaUrlContext } = await import('@/lib/exa-url-context');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_1' });
    (fetchExaUrlContext as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: 'https://example.com',
      title: 'Ex',
      text: 'body',
    });

    const res = await POST(
      new Request('http://localhost/api/url-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'example.com' }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.context.text).toBe('body');
  });
});