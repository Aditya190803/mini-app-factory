import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';
import { extractToolCalls } from '@/lib/transform-tool-calls';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
  saveFiles: vi.fn(),
}));

vi.mock('@/lib/ai-client', () => ({
  getAIClient: vi.fn(),
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

describe('POST /api/transform', () => {
  test('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/transform/route');
    const { stackServerApp } = await import('@/stack/server');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', prompt: 'Update the hero' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test('returns 400 for invalid payload', async () => {
    const { POST } = await import('@/app/api/transform/route');
    const { stackServerApp } = await import('@/stack/server');
    const mockUser = { id: 'user_123' } as Awaited<ReturnType<typeof stackServerApp.getUser>>;
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockUser);

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('applies tool calls and returns updated files', async () => {
    const { POST } = await import('@/app/api/transform/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles, saveFiles } = await import('@/lib/projects');
    const { getAIClient } = await import('@/lib/ai-client');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'user_123',
      html: '<html><body><h1>Old</h1></body></html>',
    });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<html><body><h1>Old</h1></body></html>', language: 'html', fileType: 'page' },
    ]);
    (saveFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (getAIClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      createSession: vi.fn().mockResolvedValue({
        sendAndWait: vi.fn().mockResolvedValue({
          data: {
            content: '[{"tool":"replaceContent","args":{"file":"index.html","selector":"h1","newContent":"New"}}]',
          },
        }),
        destroy: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', prompt: 'Update title' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.full).toBe(false);
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files[0].path).toBe('index.html');
    expect(body.files[0].content).toContain('New');
  });

  test('repairs malformed tool-call output automatically', async () => {
    const { POST } = await import('@/app/api/transform/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles, saveFiles } = await import('@/lib/projects');
    const { getAIClient } = await import('@/lib/ai-client');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'user_123' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: 'user_123',
      html: '<html><body><h1>Old</h1></body></html>',
    });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'index.html', content: '<html><body><h1>Old</h1></body></html>', language: 'html', fileType: 'page' },
    ]);
    (saveFiles as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const sendAndWait = vi
      .fn()
      .mockResolvedValueOnce({ data: { content: 'Here are the changes: [tool: replaceContent]' } })
      .mockResolvedValueOnce({
        data: {
          content: '[{"tool":"replaceContent","args":{"file":"index.html","selector":"h1","newContent":"Recovered"}}]',
        },
      });

    (getAIClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      createSession: vi.fn().mockResolvedValue({
        sendAndWait,
        destroy: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const req = new Request('http://localhost/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: 'demo-project', prompt: 'Update title' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files[0].content).toContain('Recovered');
    expect(sendAndWait).toHaveBeenCalledTimes(2);
  });
});

describe('extractToolCalls', () => {
  test('parses fenced JSON arrays', () => {
    const calls = extractToolCalls('```json\n[{"tool":"updateFile","args":{"file":"index.html","content":"<h1>Hi</h1>"}}]\n```');
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('updateFile');
    expect(calls[0].args).toEqual({ file: 'index.html', content: '<h1>Hi</h1>' });
  });

  test('accepts single tool-call object payloads', () => {
    const calls = extractToolCalls('{"tool":"updateFile","args":{"file":"index.html","content":"x"}}');
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('updateFile');
  });

  test('rejects malformed JSON', () => {
    expect(() => extractToolCalls('[{"tool":"updateFile","args":{"file":"index.html"}}'))
      .toThrow(/invalid json in tool calls/i);
  });

  test('recovers from non-json prefix/suffix text', () => {
    const calls = extractToolCalls(
      'I will apply these changes:\n[{"tool":"updateFile","args":{"file":"index.html","content":"<h1>Hi</h1>"}}]\nDone.'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('updateFile');
  });

  test('recovers from trailing commas in tool call JSON', () => {
    const calls = extractToolCalls(
      '[{"tool":"updateFile","args":{"file":"index.html","content":"<h1>Hi</h1>",},},]'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual({ file: 'index.html', content: '<h1>Hi</h1>' });
  });

  test('accepts wrapped toolCalls payload', () => {
    const calls = extractToolCalls(
      '{"toolCalls":[{"tool":"updateFile","args":{"file":"index.html","content":"<h1>Hi</h1>"}}]}'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('updateFile');
  });

  test('accepts function-call style payload', () => {
    const calls = extractToolCalls(
      '[{"function":{"name":"replaceContent","arguments":"{\\"file\\":\\"index.html\\",\\"selector\\":\\"h1\\",\\"newContent\\":\\"New\\"}"}}]'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('replaceContent');
    expect(calls[0].args).toEqual({ file: 'index.html', selector: 'h1', newContent: 'New' });
  });
});
