import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
}));

vi.mock('@/lib/repo-content', () => ({
  generateReadmeContent: vi.fn(),
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

describe('POST /api/generate/readme', () => {
  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/generate/readme/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/generate/readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  test('returns 404 when project does not exist', async () => {
    const { POST } = await import('@/app/api/generate/readme/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/generate/readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(404);
  });

  test('returns 403 for unauthorized project access', async () => {
    const { POST } = await import('@/app/api/generate/readme/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: 'other_user' });

    const req = new Request('http://localhost/api/generate/readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  test('uses canonical stored files and project prompt fallback', async () => {
    const { POST } = await import('@/app/api/generate/readme/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { generateReadmeContent } = await import('@/lib/repo-content');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'user_123',
      prompt: 'Create a portfolio website',
    });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<h1>Hello</h1>' },
      { path: 'styles.css', content: 'body { color: black; }' },
    ]);
    (generateReadmeContent as ReturnType<typeof vi.fn>).mockResolvedValueOnce('# README');

    const req = new Request('http://localhost/api/generate/readme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(generateReadmeContent).toHaveBeenCalledWith({
      projectName: 'demo-project',
      prompt: 'Create a portfolio website',
      files: ['index.html', 'styles.css'],
    });
  });
});

/**
 * The export path used to send a `files` key that the strict schema rejects, so every request
 * 400'd and the ZIP silently shipped the stub README instead. These pin both halves of the
 * contract so a caller and the schema cannot drift apart again without a test failing.
 */
describe('POST /api/generate/readme — request contract', () => {
  async function post(body: unknown) {
    const { POST } = await import('@/app/api/generate/readme/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { generateReadmeContent } = await import('@/lib/repo-content');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user_1' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'demo-project',
      userId: 'user_1',
      prompt: 'a demo',
    });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      { path: 'index.html', content: '<h1>hi</h1>', language: 'html', fileType: 'page' },
    ]);
    (generateReadmeContent as ReturnType<typeof vi.fn>).mockResolvedValue('# Generated');

    return POST(
      new Request('http://localhost/api/generate/readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as never
    );
  }

  test('accepts the payload the export actually sends', async () => {
    const res = await post({ projectName: 'demo-project', prompt: 'a demo' });
    expect(res.status).toBe(200);
    expect((await res.json()).content).toBe('# Generated');
  });

  test('rejects a stray files key — the shape that broke the export', async () => {
    const res = await post({
      projectName: 'demo-project',
      prompt: 'a demo',
      files: ['index.html'],
    });
    expect(res.status).toBe(400);
  });
});
