import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { DEFAULT_CLOUDFLARE_OAUTH_SCOPES, isCloudflareOAuthConfigured } from '@/lib/cloudflare-oauth';

describe('Cloudflare OAuth config', () => {
  test('is unconfigured without client id and secret', () => {
    const savedId = process.env.CLOUDFLARE_CLIENT_ID;
    const savedSecret = process.env.CLOUDFLARE_CLIENT_SECRET;
    delete process.env.CLOUDFLARE_CLIENT_ID;
    delete process.env.CLOUDFLARE_CLIENT_SECRET;
    try {
      expect(isCloudflareOAuthConfigured()).toBe(false);
    } finally {
      if (savedId !== undefined) process.env.CLOUDFLARE_CLIENT_ID = savedId;
      if (savedSecret !== undefined) process.env.CLOUDFLARE_CLIENT_SECRET = savedSecret;
    }
  });

  test('defaults include pages, workers, and offline_access', () => {
    expect(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).toContain('pages:write');
    expect(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).toContain('workers_scripts:write');
    expect(DEFAULT_CLOUDFLARE_OAUTH_SCOPES).toContain('offline_access');
  });

  test("only requests scopes that exist in Cloudflare's OAuth catalog", () => {
    // Snapshot of the catalog wrangler validates against. An unknown scope
    // fails the whole consent, so a typo here breaks Cloudflare connect.
    const catalog = new Set([
      'account:read', 'user:read', 'pages:write', 'workers:write', 'workers_scripts:write',
      'workers_routes:write', 'workers_kv:write', 'd1:write', 'vectorize:write',
      'queues:write', 'zone:read', 'ai:write', 'browser:write', 'offline_access',
    ]);
    for (const scope of DEFAULT_CLOUDFLARE_OAUTH_SCOPES.split(' ')) {
      expect(catalog, scope).toContain(scope);
    }
  });
});
