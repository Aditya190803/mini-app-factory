import { beforeEach, describe, expect, test, vi } from 'vitest';
import { toBase64JSON } from '@/lib/ai-admin-config';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));
vi.mock('@/lib/ai-settings-store', () => ({
  getPersistedAISettings: vi.fn(),
  getGlobalAdminModelConfig: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-google-key';
});

describe('GET /api/ai/models admin guard', () => {
  test('non-admin header cannot disable providers globally', async () => {
    const { GET } = await import('@/app/api/ai/models/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getPersistedAISettings, getGlobalAdminModelConfig } = await import('@/lib/ai-settings-store');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user_1',
      primaryEmail: 'user@example.com',
    });
    (getGlobalAdminModelConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      providers: {
        google: { enabled: true, defaultModel: 'gemini-3-flash-preview', customModels: [], visibleModels: [] },
        groq: { enabled: true, defaultModel: 'moonshotai/kimi-k2-instruct-0905', customModels: [], visibleModels: [] },
        openrouter: { enabled: true, defaultModel: 'openai/gpt-oss-120b', customModels: [], visibleModels: [] },
        cerebras: { enabled: true, defaultModel: 'llama-3.3-70b', customModels: [], visibleModels: [] },
      },
      providerOrder: ['google', 'groq', 'openrouter', 'cerebras'],
    });
    (getPersistedAISettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      adminConfig: {},
      byokConfig: {},
      customModels: {},
    });

    const maliciousHeader = toBase64JSON({
      providers: {
        google: { enabled: false, defaultModel: 'x', customModels: [] },
        groq: { enabled: false, defaultModel: 'x', customModels: [] },
        openrouter: { enabled: false, defaultModel: 'x', customModels: [] },
        cerebras: { enabled: false, defaultModel: 'x', customModels: [] },
      },
    });

    const req = new Request('http://localhost/api/ai/models', {
      headers: {
        'x-maf-ai-config': maliciousHeader,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.some((m: { providerId: string }) => m.providerId === 'google')).toBe(true);
  });
});
