import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/deploy', () => {
  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid payload', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: '../bad' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 404 when project is missing', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  test('returns 403 when user does not own project', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'other_user' });

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  test('returns 400 when project has no files', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'user_123' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 when GitHub is not connected', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { getIntegrationTokens } = await import('@/lib/integrations');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'user_123' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ path: 'index.html', content: '<h1>Hi</h1>' }]);
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', deployMode: 'github-only' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('streams success for github-only deploy', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { getIntegrationTokens } = await import('@/lib/integrations');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'user_123' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<h1>Hello</h1>' },
      { path: 'README.md', content: '# Demo' },
    ]);
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      githubAccessToken: 'gh-token',
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
      }

      if (url.includes('https://api.github.com/repos/octocat/demo-project') && !url.includes('/contents/')) {
        return new Response(
          JSON.stringify({
            name: 'demo-project',
            full_name: 'octocat/demo-project',
            default_branch: 'main',
            owner: { login: 'octocat' },
            id: 123,
          }),
          { status: 200 }
        );
      }

      if (url.includes('/contents/') && method === 'GET') {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }

      if (url.includes('/contents/') && method === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });

    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', deployMode: 'github-only' }),
    });

    try {
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/event-stream');

      const streamOutput = await res.text();
      expect(streamOutput).toContain('"status":"success"');
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
