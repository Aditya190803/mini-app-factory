import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({ stackServerApp: { getUser: vi.fn() } }));
vi.mock('@/lib/projects', () => ({
  getProject: vi.fn(),
  getFiles: vi.fn(async () => []),
  getUserProjects: vi.fn(async () => []),
  getProjectCloudflareEnvVars: vi.fn(async () => null),
  updateCloudflareProjectConfig: vi.fn(async () => undefined),
}));
vi.mock('@/lib/integrations', () => ({
  getIntegrationTokens: vi.fn(async () => ({ cloudflareApiToken: 'cf-token', cloudflareAccountId: 'acct' })),
}));
vi.mock('@/lib/cloudflare', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloudflare')>();
  return {
    CloudflareApiError: actual.CloudflareApiError,
    normalizeCloudflareProjectName: actual.normalizeCloudflareProjectName,
    cloudflareRequest: vi.fn(async () => []),
    queryCloudflareD1: vi.fn(async () => [{ results: [] }]),
    listCloudflareZones: vi.fn(async () => []),
    getCloudflarePagesDomain: vi.fn(),
    addCloudflarePagesDomain: vi.fn(),
    removeCloudflarePagesDomain: vi.fn(),
    configureCloudflarePagesProject: vi.fn(),
    rollbackCloudflarePagesDeployment: vi.fn(async () => ({ id: 'd1' })),
    ensureCloudflarePagesProject: vi.fn(async () => ({ name: 'app', subdomain: 'app-x1y.pages.dev' })),
  };
});
vi.mock('@/lib/cloudflare-deploy', () => ({
  deployProjectToCloudflare: vi.fn(async () => ({ deploymentUrl: 'https://p.pages.dev' })),
  readCloudflareEnvVars: vi.fn(() => ({})),
  cloudflareEnvVarsContext: (name: string) => `cloudflare-env:${name}`,
  cloudflarePagesUrl: (name: string, subdomain?: string) => `https://${subdomain || `${name}.pages.dev`}`,
}));
vi.mock('@/lib/cloudflare-workers', () => ({ configureCloudflareWorkerSecrets: vi.fn() }));
vi.mock('@/lib/error-reporting', () => ({ reportError: vi.fn() }));

const { stackServerApp } = await import('@/stack/server');
const projects = await import('@/lib/projects');
const cloudflare = await import('@/lib/cloudflare');

const project = (role: 'owner' | 'editor' | 'viewer', extra: Record<string, unknown> = {}) => ({
  name: 'app',
  prompt: 'p',
  status: 'completed',
  createdAt: 1,
  accessRole: role,
  cloudflareProjectName: 'app',
  cloudflareD1DatabaseId: 'db-id',
  cloudflareResourcesJson: JSON.stringify({ version: 1, r2: { FILES: { name: 'app-files' } }, worker: { 'app-api': { name: 'app-api', source: '_worker.js' } }, migrationHashes: { 'migrations/1.sql': 'abcdefgh' } }),
  ...extra,
});

function request(url: string, method: string, body?: unknown) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Case = { name: string; call: () => Promise<Response> };

async function cases(): Promise<Case[]> {
  const d1 = await import('@/app/api/cloudflare/d1/route');
  const domain = await import('@/app/api/cloudflare/domain/route');
  const plan = await import('@/app/api/cloudflare/plan/route');
  const preview = await import('@/app/api/cloudflare/preview/route');
  const r2 = await import('@/app/api/cloudflare/r2/route');
  const resources = await import('@/app/api/cloudflare/resources/route');
  const rollback = await import('@/app/api/cloudflare/rollback/route');
  const secrets = await import('@/app/api/cloudflare/secrets/route');
  return [
    { name: 'GET d1', call: () => d1.GET(request('/api/cloudflare/d1?projectName=app', 'GET')) },
    { name: 'GET domain', call: () => domain.GET(request('/api/cloudflare/domain?projectName=app', 'GET')) },
    { name: 'POST domain', call: () => domain.POST(request('/api/cloudflare/domain', 'POST', { projectName: 'app', domain: 'app.example.com' })) },
    { name: 'DELETE domain', call: () => domain.DELETE(request('/api/cloudflare/domain', 'DELETE', { projectName: 'app' })) },
    { name: 'POST plan', call: () => plan.POST(request('/api/cloudflare/plan', 'POST', { projectName: 'app' })) },
    { name: 'POST preview', call: () => preview.POST(request('/api/cloudflare/preview', 'POST', { projectName: 'app' })) },
    { name: 'DELETE preview', call: () => preview.DELETE(request('/api/cloudflare/preview', 'DELETE', { projectName: 'app' })) },
    { name: 'GET r2', call: () => r2.GET(request('/api/cloudflare/r2?projectName=app&bucket=app-files', 'GET')) },
    { name: 'DELETE r2', call: () => r2.DELETE(request('/api/cloudflare/r2', 'DELETE', { projectName: 'app', bucket: 'app-files', key: 'a.png' })) },
    { name: 'DELETE resources', call: () => resources.DELETE(request('/api/cloudflare/resources', 'DELETE', { projectName: 'app', confirmName: 'app' })) },
    { name: 'POST rollback', call: () => rollback.POST(request('/api/cloudflare/rollback', 'POST', { projectName: 'app', deploymentId: 'abc-123' })) },
    { name: 'GET secrets', call: () => secrets.GET(request('/api/cloudflare/secrets?projectName=app', 'GET')) },
    { name: 'POST secrets', call: () => secrets.POST(request('/api/cloudflare/secrets', 'POST', { projectName: 'app', name: 'API_KEY', value: 'v' })) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user_1' });
});

describe('Cloudflare routes are owner-only', () => {
  test.each(['viewer', 'editor'] as const)('a %s gets 403 from every route', async (role) => {
    (projects.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(project(role));
    for (const { name, call } of await cases()) {
      const response = await call();
      expect(response.status, name).toBe(403);
    }
    expect(projects.updateCloudflareProjectConfig).not.toHaveBeenCalled();
    expect(cloudflare.cloudflareRequest).not.toHaveBeenCalled();
  });

  test('a non-member gets 404 and an anonymous caller 401', async () => {
    (projects.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    for (const { name, call } of await cases()) expect((await call()).status, name).toBe(404);
    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    for (const { name, call } of await cases()) expect((await call()).status, name).toBe(401);
  });
});

describe('Cloudflare route behaviour for the owner', () => {
  beforeEach(() => {
    (projects.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(project('owner'));
  });

  test('secrets are encrypted bound to the project', async () => {
    process.env.INTEGRATION_TOKEN_SECRET = '12345678901234567890123456789012';
    const { POST } = await import('@/app/api/cloudflare/secrets/route');
    const response = await POST(request('/api/cloudflare/secrets', 'POST', { projectName: 'app', name: 'API_KEY', value: 'v' }));
    expect(response.status).toBe(200);
    const written = (projects.updateCloudflareProjectConfig as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { cloudflareEnvVarsEncrypted: string };
    expect(written.cloudflareEnvVarsEncrypted.startsWith('maf2.')).toBe(true);
  });

  test('teardown needs the project name typed back', async () => {
    const { DELETE } = await import('@/app/api/cloudflare/resources/route');
    const refused = await DELETE(request('/api/cloudflare/resources', 'DELETE', { projectName: 'app', confirmName: 'nope' }));
    expect(refused.status).toBe(400);
    expect(cloudflare.cloudflareRequest).not.toHaveBeenCalled();
    const accepted = await DELETE(request('/api/cloudflare/resources', 'DELETE', { projectName: 'app', confirmName: 'app' }));
    expect(accepted.status).toBe(200);
    const deleted = (cloudflare.cloudflareRequest as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0] as string);
    expect(deleted.some((path) => path.includes('/pages/projects/app'))).toBe(true);
    expect(deleted.some((path) => path.includes('/r2/buckets/app-files'))).toBe(true);
    expect(deleted.some((path) => path.includes('/workers/scripts/app-api'))).toBe(true);
  });

  test('rollback uses the reported subdomain and says what stayed on the latest version', async () => {
    const { POST } = await import('@/app/api/cloudflare/rollback/route');
    const response = await POST(request('/api/cloudflare/rollback', 'POST', { projectName: 'app', deploymentId: 'abc-123' }));
    expect(await response.json()).toMatchObject({ notRolledBack: ['Worker app-api', 'D1 database migrations'] });
    expect(projects.updateCloudflareProjectConfig).toHaveBeenCalledWith(expect.objectContaining({ deploymentUrl: 'https://app-x1y.pages.dev' }));
  });

  test('expired previews count toward the quota and are reaped first', async () => {
    const { POST } = await import('@/app/api/cloudflare/preview/route');
    const expired = (name: string) => ({ ...project('owner'), name, cloudflarePreviewProjectName: `${name}-preview`, cloudflarePreviewExpiresAt: 1 });
    (projects.getUserProjects as ReturnType<typeof vi.fn>).mockResolvedValue([expired('a'), expired('b'), expired('c')]);
    const response = await POST(request('/api/cloudflare/preview', 'POST', { projectName: 'app' }));
    // All three expired previews were torn down, so the new one is allowed.
    expect(response.status).toBe(200);
    expect((cloudflare.cloudflareRequest as ReturnType<typeof vi.fn>).mock.calls.filter((call) => String(call[0]).includes('-preview')).length).toBe(3);
  });

  test('a provider auth failure is reported as 403 with a reconnect hint, not 400', async () => {
    (cloudflare.queryCloudflareD1 as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new cloudflare.CloudflareApiError('Authentication error', 401));
    const { GET } = await import('@/app/api/cloudflare/d1/route');
    const response = await GET(request('/api/cloudflare/d1?projectName=app', 'GET'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'UPSTREAM_FORBIDDEN' });
  });
});
