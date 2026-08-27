import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

const aiMocks = vi.hoisted(() => ({ createSession: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai-client', () => ({
  getAIClient: vi.fn(async () => ({ createSession: aiMocks.createSession })),
}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));

vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(),
  saveProject: vi.fn(),
  saveFiles: vi.fn(),
}));

vi.mock('@/lib/resolve-reference-url', () => ({
  appendReferenceUrlToPrompt: vi.fn(async (base: string) => ({ prompt: base })),
}));

vi.mock('@/lib/ai-settings-store', () => ({
  getPersistedAISettings: vi.fn().mockResolvedValue({
    adminConfig: { providers: { opencode: { enabled: true, defaultModel: 'deepseek-v4-flash-free', customModels: [], visibleModels: [] }, openrouter: { enabled: true, defaultModel: 'openrouter/free', customModels: [], visibleModels: [] } }, providerOrder: ['opencode', 'openrouter'] },
    byokConfig: {},
    customModels: {},
  }),
  getGlobalAdminModelConfig: vi.fn().mockResolvedValue({
    providers: { opencode: { enabled: true, defaultModel: 'deepseek-v4-flash-free', customModels: [], visibleModels: [] }, openrouter: { enabled: true, defaultModel: 'openrouter/free', customModels: [], visibleModels: [] } },
    providerOrder: ['opencode', 'openrouter'],
  }),
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

  test('uses the stored OpenRouter free model instead of forcing OpenCode', async () => {
    const { runGeneration } = await import('@/app/api/generate/route');
    const { getProject, saveProject, saveFiles } = await import('@/lib/projects');
    const session = (content: string) => ({
      sendAndWait: vi.fn().mockResolvedValue({ data: { content } }),
      on: vi.fn(() => () => {}),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    (saveProject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (saveFiles as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: 'monkey-type',
      prompt: 'Build a typing test',
      status: 'error',
      selectedModel: 'openrouter/free',
      providerId: 'openrouter',
    });
    aiMocks.createSession
      .mockResolvedValueOnce(session('Concise design spec'))
      .mockResolvedValueOnce(session([
        '```html:index.html',
        '<link rel="stylesheet" href="styles.css"><main>Typing test</main><script src="script.js" defer></script>',
        '```',
        '```css:styles.css',
        'body { color: white; }',
        '```',
        '```javascript:script.js',
        'console.log("ready");',
        '```',
      ].join('\n')));

    await runGeneration('monkey-type', 'Build a typing test', new AbortController().signal);

    expect(aiMocks.createSession).toHaveBeenCalledTimes(2);
    expect(aiMocks.createSession).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: 'openrouter/free',
      providerId: 'openrouter',
    }));
    expect(aiMocks.createSession).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: 'openrouter/free',
      providerId: 'openrouter',
    }));
    expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({
      selectedModel: 'openrouter/free',
      providerId: 'openrouter',
    }));
  });

  test('ignores a paid OpenRouter selection so the default chain can run', async () => {
    const { runGeneration } = await import('@/app/api/generate/route');
    const { getProject, saveProject, saveFiles } = await import('@/lib/projects');
    const session = (content: string) => ({
      sendAndWait: vi.fn().mockResolvedValue({ data: { content } }),
      on: vi.fn(() => () => {}),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    (saveProject as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (saveFiles as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: 'paid-model',
      prompt: 'Build a landing page',
      status: 'pending',
      selectedModel: 'anthropic/claude-3.5-sonnet',
      providerId: 'openrouter',
    });
    aiMocks.createSession
      .mockResolvedValueOnce(session('Spec'))
      .mockResolvedValueOnce(session([
        '```html:index.html',
        '<link rel="stylesheet" href="styles.css"><main>Hi</main><script src="script.js" defer></script>',
        '```',
        '```css:styles.css',
        'body{}',
        '```',
        '```javascript:script.js',
        'console.log(1);',
        '```',
      ].join('\n')));

    await runGeneration('paid-model', 'Build a landing page', new AbortController().signal);

    expect(aiMocks.createSession).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: undefined,
      providerId: undefined,
    }));
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
