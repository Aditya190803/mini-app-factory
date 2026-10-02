import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 60_000 })),
}));
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

vi.mock('@/lib/cloudflare-deploy', () => ({
  deployProjectToCloudflare: vi.fn(),
}));

beforeAll(() => {
  process.env.OPENCODE_API_KEY = 'test-key';
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
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accessRole: 'owner', userId: 'user_123' });
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
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accessRole: 'owner', userId: 'user_123' });
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

  test('streams success for Cloudflare direct deploy without GitHub', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { getIntegrationTokens } = await import('@/lib/integrations');
    const { deployProjectToCloudflare } = await import('@/lib/cloudflare-deploy');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ name: 'demo-project', userId: 'user_123', accessRole: 'owner' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ path: 'index.html', content: '<h1>Hello</h1>' }]);
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      cloudflareApiToken: 'cf-token',
      cloudflareAccountId: 'account-1',
    });
    (deployProjectToCloudflare as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentId: 'deployment-1',
      deploymentUrl: 'https://demo-project.pages.dev',
      cloudflareProjectName: 'demo-project',
    });

    const req = new Request('http://localhost/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', deployMode: 'cloudflare', confirmCloudflareResources: true }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('https://demo-project.pages.dev');
    expect(deployProjectToCloudflare).toHaveBeenCalledWith(expect.objectContaining({
      token: 'cf-token',
      accountId: 'account-1',
      allowResourceCreation: true,
    }));
  });

  test('streams success for github-only deploy', async () => {
    const { POST } = await import('@/app/api/deploy/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { getIntegrationTokens } = await import('@/lib/integrations');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accessRole: 'owner', userId: 'user_123' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<h1>Hello</h1>' },
      { path: 'README.md', content: '# Demo' },
    ]);
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      githubAccessToken: 'gh-token',
    });

    const trees: Array<{ tree: Array<{ path: string }>; base_tree?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({ login: 'octocat' }), { status: 200 });
      }

      const repo = 'https://api.github.com/repos/octocat/demo-project';
      if (url === repo) {
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
      if (url === `${repo}/git/ref/heads/main`) {
        return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
      }
      if (url === `${repo}/git/commits/parent-sha`) {
        return new Response(JSON.stringify({ tree: { sha: 'old-tree' } }), { status: 200 });
      }
      if (url === `${repo}/git/trees` && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { tree: Array<{ path: string }>; base_tree?: string };
        // The whole tree is replaced (no base_tree), so files deleted in the editor go too.
        trees.push(body);
        return new Response(JSON.stringify({ sha: 'new-tree' }), { status: 201 });
      }
      if (url === `${repo}/git/commits` && method === 'POST') {
        return new Response(JSON.stringify({ sha: 'new-commit' }), { status: 201 });
      }
      if (url === `${repo}/git/refs/heads/main` && method === 'PATCH') {
        return new Response(JSON.stringify({ object: { sha: 'new-commit' } }), { status: 200 });
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
      expect(trees).toHaveLength(1);
      expect(trees[0]!.base_tree).toBeUndefined();
      expect(trees[0]!.tree.map((entry) => entry.path).sort()).toEqual(['README.md', 'index.html']);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
