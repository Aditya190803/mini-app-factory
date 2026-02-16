import { beforeEach, describe, expect, test, vi } from 'vitest';
import { testApiHandler } from 'next-test-api-route-handler';

vi.mock('server-only', () => ({}));
vi.mock('@/stack/server', () => ({
  stackServerApp: { getUser: vi.fn() },
}));
vi.mock('@/lib/projects', () => ({
  projectExists: vi.fn(),
  saveProject: vi.fn(),
}));
vi.mock('@/lib/csrf', () => ({
  validateOrigin: vi.fn(() => true),
}));
vi.mock('@/lib/oauth', () => ({
  createOAuthStateCookie: vi.fn(async () => 'state-token'),
  getBaseUrl: vi.fn(async () => 'http://localhost:3000'),
  sanitizeReturnTo: vi.fn((value: string | null) => value || '/dashboard'),
}));

describe('API integration harness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('POST /api/check-name rejects invalid origin (integration)', async () => {
    const route = await import('@/app/api/check-name/route');
    const { validateOrigin } = await import('@/lib/csrf');
    (validateOrigin as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    await testApiHandler({
      appHandler: route,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'demo-site' }),
        });

        expect(response.status).toBe(403);
      },
    });
  });

  test('POST /api/check-name saves a pending project on valid request (integration)', async () => {
    const route = await import('@/app/api/check-name/route');
    const { stackServerApp } = await import('@/stack/server');
    const { projectExists, saveProject } = await import('@/lib/projects');

    (stackServerApp.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'user_1',
      primaryEmail: 'user@example.com',
    });
    (projectExists as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    (saveProject as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await testApiHandler({
      appHandler: route,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost',
            host: 'localhost',
          },
          body: JSON.stringify({
            name: 'My-Project',
            prompt: 'Build a SaaS landing page with pricing and FAQ.',
          }),
        });

        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload).toMatchObject({ success: true, name: 'my-project' });
      },
    });

    expect(saveProject).toHaveBeenCalled();
  });

  test('GET /api/integrations/github/start rejects invalid origin (integration)', async () => {
    const route = await import('@/app/api/integrations/github/start/route');
    const { validateOrigin } = await import('@/lib/csrf');
    (validateOrigin as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    await testApiHandler({
      appHandler: route,
      test: async ({ fetch }) => {
        const response = await fetch({ method: 'GET' });
        expect(response.status).toBe(403);
      },
    });
  });
});
