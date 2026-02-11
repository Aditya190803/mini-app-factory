import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
  saveProject: vi.fn(),
  saveFiles: vi.fn(),
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

describe('POST /api/generate', () => {
  test('returns 400 for invalid payload', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('returns 404 when project does not exist', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'missing-project', prompt: 'Build a hero section' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  test('returns 403 when user does not own project', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: 'demo-project',
      prompt: 'Build a landing page',
      userId: 'other_user',
    });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  test('returns 400 when prompt is missing in request and project', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: 'demo-project',
      prompt: '',
      userId: 'user_123',
    });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_PAYLOAD');
  });

  test('rejects invalid projectName format', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: '../bad-name', prompt: 'x' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('returns SSE response for a valid generation request', async () => {
    const { POST } = await import('@/app/api/generate/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject } = await import('@/lib/projects');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: 'demo-project',
      prompt: 'Build a landing page',
      userId: 'user_123',
    });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', prompt: 'Build a landing page' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const streamOutput = await res.text();
    expect(streamOutput).toContain('"status":"initializing"');
  });
});
