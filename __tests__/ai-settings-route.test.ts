import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_AI_ADMIN_CONFIG } from '@/lib/ai-admin-config';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));
vi.mock('@/lib/ai-settings-store', () => ({
  getPersistedAISettings: vi.fn(),
  savePersistedAISettings: vi.fn(),
  addAIAdminAudit: vi.fn(),
  getGlobalAdminModelConfig: vi.fn(),
  saveGlobalAdminModelConfig: vi.fn(),
  saveUserCustomModels: vi.fn(),
  getUserCustomModels: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ai/settings', () => {
  test('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/ai/settings/route');
    const { stackServerApp } = await import('@/stack/server');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  test('returns admin config and byok for authenticated user', async () => {
    const { GET } = await import('@/app/api/ai/settings/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getGlobalAdminModelConfig, getPersistedAISettings } = await import('@/lib/ai-settings-store');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user_1',
      primaryEmail: 'user@example.com',
    });
    (getGlobalAdminModelConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(DEFAULT_AI_ADMIN_CONFIG);
    (getPersistedAISettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      adminConfig: DEFAULT_AI_ADMIN_CONFIG,
      byokConfig: {},
      customModels: {},
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adminConfig).toBeDefined();
  });
});

describe('POST /api/ai/settings', () => {
  test('non-admin cannot change admin config', async () => {
    const { POST } = await import('@/app/api/ai/settings/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getPersistedAISettings, savePersistedAISettings, addAIAdminAudit, getGlobalAdminModelConfig, getUserCustomModels } = await import('@/lib/ai-settings-store');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user_1',
      primaryEmail: 'user@example.com',
    });

    const existing = {
      adminConfig: DEFAULT_AI_ADMIN_CONFIG,
      byokConfig: {},
      customModels: {},
    };

    // BYOK save path calls getPersistedAISettings then savePersistedAISettings
    (getPersistedAISettings as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (savePersistedAISettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    // Return state at end of POST
    (getGlobalAdminModelConfig as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_AI_ADMIN_CONFIG);
    (getUserCustomModels as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const modifiedAdmin = {
      ...DEFAULT_AI_ADMIN_CONFIG,
      providers: {
        ...DEFAULT_AI_ADMIN_CONFIG.providers,
        google: {
          ...DEFAULT_AI_ADMIN_CONFIG.providers.google,
          enabled: false,
        },
      },
    };

    const req = new Request('http://localhost/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminConfig: modifiedAdmin,
        byokConfig: { groq: 'user-key' },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Non-admin: BYOK is saved per-user but admin config is NOT saved globally
    expect(savePersistedAISettings).toHaveBeenCalled();
    expect(addAIAdminAudit).not.toHaveBeenCalled();
  });

  test('admin change creates audit log', async () => {
    const { POST } = await import('@/app/api/ai/settings/route');
    const { stackServerApp } = await import('@/stack/server');
    const { getPersistedAISettings, addAIAdminAudit, getGlobalAdminModelConfig, saveGlobalAdminModelConfig, getUserCustomModels } = await import('@/lib/ai-settings-store');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'admin_1',
      primaryEmail: 'aditya.mer@somaiya.edu',
    });

    // getGlobalAdminModelConfig called twice: once for diff, once for response
    (getGlobalAdminModelConfig as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_AI_ADMIN_CONFIG);
    (saveGlobalAdminModelConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (addAIAdminAudit as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getUserCustomModels as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (getPersistedAISettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      adminConfig: DEFAULT_AI_ADMIN_CONFIG,
      byokConfig: {},
      customModels: {},
    });

    const modifiedAdmin = {
      ...DEFAULT_AI_ADMIN_CONFIG,
      providers: {
        ...DEFAULT_AI_ADMIN_CONFIG.providers,
        openrouter: {
          ...DEFAULT_AI_ADMIN_CONFIG.providers.openrouter,
          enabled: false,
        },
      },
    };

    const req = new Request('http://localhost/api/ai/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminConfig: modifiedAdmin,
        byokConfig: {},
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(addAIAdminAudit).toHaveBeenCalledTimes(1);
  });
});
