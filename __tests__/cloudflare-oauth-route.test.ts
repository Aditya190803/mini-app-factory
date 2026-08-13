import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({ stackServerApp: { getUser: vi.fn() } }));
vi.mock('@/lib/oauth', () => ({
  createOAuthStateCookie: vi.fn(),
  consumeOAuthStateCookie: vi.fn(),
  getBaseUrl: vi.fn(),
  sanitizeReturnTo: vi.fn((value) => value || '/'),
}));
vi.mock('@/lib/cloudflare-oauth', () => ({
  createCloudflareAuthorizationUrl: vi.fn(),
  exchangeCloudflareCode: vi.fn(),
}));
vi.mock('@/lib/cloudflare', () => ({ listCloudflareAccounts: vi.fn() }));
vi.mock('@/lib/integrations', () => ({
  getIntegrationTokens: vi.fn(),
  upsertIntegrationTokens: vi.fn(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const { stackServerApp } = await import('@/stack/server');
  const oauth = await import('@/lib/oauth');
  (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
  (oauth.getBaseUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://factory.example');
});

describe('Cloudflare OAuth routes', () => {
  test('redirects an authenticated user to Cloudflare consent', async () => {
    const oauth = await import('@/lib/oauth');
    const cloudflareOAuth = await import('@/lib/cloudflare-oauth');
    const { GET } = await import('@/app/api/integrations/cloudflare/start/route');
    (oauth.createOAuthStateCookie as ReturnType<typeof vi.fn>).mockResolvedValue('state-1');
    (cloudflareOAuth.createCloudflareAuthorizationUrl as ReturnType<typeof vi.fn>).mockReturnValue(new URL('https://dash.cloudflare.com/oauth2/auth?state=state-1'));

    const response = await GET(new Request('https://factory.example/api/integrations/cloudflare/start?returnTo=%2Fsettings'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('dash.cloudflare.com/oauth2/auth');
  });

  test('exchanges the callback code and stores encrypted integration inputs', async () => {
    const oauth = await import('@/lib/oauth');
    const cloudflareOAuth = await import('@/lib/cloudflare-oauth');
    const { listCloudflareAccounts } = await import('@/lib/cloudflare');
    const { upsertIntegrationTokens } = await import('@/lib/integrations');
    const { GET } = await import('@/app/api/integrations/cloudflare/callback/route');
    (oauth.consumeOAuthStateCookie as ReturnType<typeof vi.fn>).mockResolvedValue('/settings');
    (cloudflareOAuth.exchangeCloudflareCode as ReturnType<typeof vi.fn>).mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', expiresAt: 123456, scope: 'workers.write' });
    (listCloudflareAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'a1', name: 'First' }, { id: 'a2', name: 'Second' }]);

    const response = await GET(new Request('https://factory.example/api/integrations/cloudflare/callback?code=code-1&state=state-1'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://factory.example/settings?connected=cloudflare&cloudflareAccounts=2');
    expect(upsertIntegrationTokens).toHaveBeenCalledWith({
      cloudflareApiToken: 'access',
      cloudflareRefreshToken: 'refresh',
      cloudflareTokenExpiresAt: 123456,
      cloudflareOAuthScope: 'workers.write',
      cloudflareAccountId: 'a1',
      cloudflareAccountName: 'First',
    });
  });

  test('rejects a callback with invalid state before exchanging a code', async () => {
    const oauth = await import('@/lib/oauth');
    const cloudflareOAuth = await import('@/lib/cloudflare-oauth');
    const { GET } = await import('@/app/api/integrations/cloudflare/callback/route');
    (oauth.consumeOAuthStateCookie as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await GET(new Request('https://factory.example/api/integrations/cloudflare/callback?code=code-1&state=wrong'));
    expect(response.status).toBe(400);
    expect(cloudflareOAuth.exchangeCloudflareCode).not.toHaveBeenCalled();
  });

  test('only switches to an account present in the OAuth grant', async () => {
    const { getIntegrationTokens, upsertIntegrationTokens } = await import('@/lib/integrations');
    const { listCloudflareAccounts } = await import('@/lib/cloudflare');
    const { POST } = await import('@/app/api/integrations/cloudflare/accounts/route');
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValue({ cloudflareApiToken: 'access' });
    (listCloudflareAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'a1', name: 'First' }]);

    const response = await POST(new Request('https://factory.example/api/integrations/cloudflare/accounts', { method: 'POST', body: JSON.stringify({ accountId: 'a2' }) }));
    expect(response.status).toBe(403);
    expect(upsertIntegrationTokens).not.toHaveBeenCalled();
  });
});
