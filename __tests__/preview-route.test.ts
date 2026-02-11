import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFile: vi.fn(),
  getFiles: vi.fn(),
}));

vi.mock('@/lib/page-builder', () => ({
  assembleFullPage: vi.fn(() => '<!doctype html><html><body>Preview</body></html>'),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.NEXT_PUBLIC_STACK_PROJECT_ID = 'stack-project';
  process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY = 'stack-client';
  process.env.STACK_SECRET_SERVER_KEY = 'stack-secret';
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /preview/[projectName]', () => {
  test('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/preview/[projectName]/[[...path]]/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(new Request('http://localhost/preview/demo') as never, {
      params: Promise.resolve({ projectName: 'demo-project' }),
    });

    expect(res.status).toBe(401);
  });

  test('returns 404 when project is missing', async () => {
    const { GET } = await import('@/app/preview/[projectName]/[[...path]]/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET(new Request('http://localhost/preview/demo') as never, {
      params: Promise.resolve({ projectName: 'demo-project' }),
    });

    expect(res.status).toBe(404);
  });

  test('returns 403 when user does not own project', async () => {
    const { GET } = await import('@/app/preview/[projectName]/[[...path]]/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'other_user' });

    const res = await GET(new Request('http://localhost/preview/demo') as never, {
      params: Promise.resolve({ projectName: 'demo-project' }),
    });

    expect(res.status).toBe(403);
  });

  test('returns rendered html for owner preview', async () => {
    const { GET } = await import('@/app/preview/[projectName]/[[...path]]/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFile, getFiles } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'user_123' });
    (getFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      path: 'index.html',
      content: '<h1>Demo</h1>',
      fileType: 'page',
    });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<h1>Demo</h1>', language: 'html', fileType: 'page' },
    ]);

    const res = await GET(new Request('http://localhost/preview/demo') as never, {
      params: Promise.resolve({ projectName: 'demo-project' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    await expect(res.text()).resolves.toContain('Preview');
  });
});
