import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({ stackServerApp: { getUser: vi.fn() } }));
vi.mock('@/lib/cloudflare', () => ({
  verifyCloudflareToken: vi.fn(),
  listCloudflareAccounts: vi.fn(),
}));
vi.mock('@/lib/integrations', () => ({ upsertIntegrationTokens: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Cloudflare connect route', () => {
  test('returns accounts before storing a multi-account token', async () => {
    const { stackServerApp } = await import('@/stack/server');
    const { verifyCloudflareToken, listCloudflareAccounts } = await import('@/lib/cloudflare');
    const { upsertIntegrationTokens } = await import('@/lib/integrations');
    const { POST } = await import('@/app/api/integrations/cloudflare/connect/route');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (verifyCloudflareToken as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'token-1', status: 'active' });
    (listCloudflareAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a1', name: 'First' },
      { id: 'a2', name: 'Second' },
    ]);

    const response = await POST(new Request('http://localhost/api/integrations/cloudflare/connect', {
      method: 'POST',
      body: JSON.stringify({ token: '12345678901234567890' }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requiresAccount: true });
    expect(upsertIntegrationTokens).not.toHaveBeenCalled();
  });

  test('stores the selected account and verified token id', async () => {
    const { stackServerApp } = await import('@/stack/server');
    const { verifyCloudflareToken, listCloudflareAccounts } = await import('@/lib/cloudflare');
    const { upsertIntegrationTokens } = await import('@/lib/integrations');
    const { POST } = await import('@/app/api/integrations/cloudflare/connect/route');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (verifyCloudflareToken as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'token-1', status: 'active' });
    (listCloudflareAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'a1', name: 'First' }]);

    const response = await POST(new Request('http://localhost/api/integrations/cloudflare/connect', {
      method: 'POST',
      body: JSON.stringify({ token: '12345678901234567890', accountId: 'a1' }),
    }));
    expect(response.status).toBe(200);
    expect(upsertIntegrationTokens).toHaveBeenCalledWith(expect.objectContaining({
      cloudflareApiToken: '12345678901234567890',
      cloudflareTokenId: 'token-1',
      cloudflareAccountId: 'a1',
    }));
  });
});
