import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({ stackServerApp: { getUser: vi.fn() } }));
vi.mock('@/lib/projects', () => ({ getProject: vi.fn(), getFiles: vi.fn() }));
vi.mock('@/lib/integrations', () => ({ getIntegrationTokens: vi.fn() }));
vi.mock('@/lib/cloudflare-resources', () => ({ planCloudflareResources: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

describe('Cloudflare resource plan route', () => {
  test('returns resource creation actions for an authenticated project', async () => {
    const { stackServerApp } = await import('@/stack/server');
    const { getProject, getFiles } = await import('@/lib/projects');
    const { getIntegrationTokens } = await import('@/lib/integrations');
    const { planCloudflareResources } = await import('@/lib/cloudflare-resources');
    const { POST } = await import('@/app/api/cloudflare/plan/route');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (getProject as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'demo' });
    (getFiles as ReturnType<typeof vi.fn>).mockResolvedValue([{
      path: 'cloudflare.json',
      content: JSON.stringify({ version: 1, bindings: { kv: [{ binding: 'CACHE', name: 'demo-cache' }] } }),
    }]);
    (getIntegrationTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
      cloudflareApiToken: 'token',
      cloudflareAccountId: 'account',
    });
    (planCloudflareResources as ReturnType<typeof vi.fn>).mockResolvedValue([
      { kind: 'kv', binding: 'CACHE', name: 'demo-cache', action: 'create' },
    ]);

    const response = await POST(new Request('http://localhost/api/cloudflare/plan', {
      method: 'POST',
      body: JSON.stringify({ projectName: 'demo' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ needsConfirmation: true });
  });

  test('rejects unauthenticated planning', async () => {
    const { stackServerApp } = await import('@/stack/server');
    const { POST } = await import('@/app/api/cloudflare/plan/route');
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await POST(new Request('http://localhost/api/cloudflare/plan', {
      method: 'POST',
      body: JSON.stringify({ projectName: 'demo' }),
    }));
    expect(response.status).toBe(401);
  });
});
