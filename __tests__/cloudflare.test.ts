import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  applyCloudflareD1Migrations,
  deployCloudflarePages,
  hashCloudflareAsset,
  normalizeCloudflareProjectName,
  prepareCloudflareAssets,
} from '@/lib/cloudflare';

function envelope(result: unknown) {
  return new Response(JSON.stringify({ success: true, result, errors: [], messages: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Cloudflare Pages helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes project names for Pages', () => {
    expect(normalizeCloudflareProjectName(' My_App / Demo ')).toBe('my-app-demo');
  });

  test('uses stable extension-aware hashes', () => {
    const first = hashCloudflareAsset('index.html', '<h1>Hello</h1>');
    expect(first).toHaveLength(32);
    expect(hashCloudflareAsset('copy.html', '<h1>Hello</h1>')).toBe(first);
    expect(hashCloudflareAsset('copy.txt', '<h1>Hello</h1>')).not.toBe(first);
  });

  test('separates worker and migration files from static assets', () => {
    const prepared = prepareCloudflareAssets([
      { path: 'index.html', content: '<h1>Hello</h1>' },
      { path: '_worker.js', content: 'export default { fetch() {} }' },
      { path: 'migrations/0001_init.sql', content: 'CREATE TABLE demo(id INTEGER);' },
    ]);

    expect(prepared.assets.map((asset) => asset.path)).toEqual(['index.html']);
    expect(prepared.special.get('_worker.js')).toContain('export default');
  });

  test('applies only new D1 migrations in filename order', async () => {
    const queries: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const sql = JSON.parse(String(init?.body)).sql as string;
      queries.push(sql);
      if (sql.startsWith('SELECT name')) return envelope([{ success: true, results: [{ name: 'migrations/0001_init.sql' }] }]);
      return envelope([{ success: true, results: [] }]);
    });

    await applyCloudflareD1Migrations({
      token: 'api-token',
      accountId: 'account-1',
      databaseId: 'db-1',
      migrations: [
        { path: 'migrations/0002_posts.sql', content: 'CREATE TABLE posts(id INTEGER);' },
        { path: 'migrations/0001_init.sql', content: 'CREATE TABLE users(id INTEGER);' },
      ],
    });

    expect(queries).toHaveLength(3);
    expect(queries[2]).toContain('CREATE TABLE posts');
    expect(queries[2]).not.toContain('CREATE TABLE users');
  });

  test('uploads missing assets and creates a worker deployment', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/upload-token')) return envelope({ jwt: 'upload-jwt' });
      if (url.endsWith('/pages/assets/check-missing')) {
        const body = JSON.parse(String(init?.body));
        return envelope(body.hashes);
      }
      if (url.endsWith('/pages/assets/upload')) return envelope(null);
      if (url.endsWith('/pages/assets/upsert-hashes')) return envelope(null);
      if (url.endsWith('/deployments')) {
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init?.body as FormData;
        expect(JSON.parse(String(form.get('manifest')))).toHaveProperty('/index.html');
        expect(form.get('_worker.js')).toBeInstanceOf(Blob);
        return envelope({ id: 'deployment-1', url: 'https://deployment.pages.dev' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await deployCloudflarePages({
      token: 'api-token',
      accountId: 'account-1',
      projectName: 'demo',
      files: [
        { path: 'index.html', content: '<h1>Hello</h1>' },
        { path: '_worker.js', content: 'export default { fetch(request, env) { return env.ASSETS.fetch(request); } }' },
      ],
    });

    expect(result.id).toBe('deployment-1');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
