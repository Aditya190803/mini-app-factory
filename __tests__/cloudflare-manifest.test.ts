import { describe, expect, test } from 'vitest';
import {
  parseCloudflareManifest,
  parseCloudflareResourceState,
} from '@/lib/cloudflare-manifest';

describe('Cloudflare resource manifest', () => {
  test('parses every Pages binding and normalizes migration paths', () => {
    const manifest = parseCloudflareManifest([{
      path: 'cloudflare.json',
      content: JSON.stringify({
        version: 1,
        bindings: {
          d1: [{ binding: 'DB', name: 'demo-db', migrations: '/db\\migrations/' }],
          kv: [{ binding: 'CACHE', name: 'demo-cache' }],
          r2: [{ binding: 'UPLOADS', name: 'demo-uploads' }],
          queues: [{ binding: 'JOBS', name: 'demo-jobs' }],
          vectorize: [{ binding: 'SEARCH', name: 'demo-search', dimensions: 768, metric: 'cosine' }],
          analyticsEngine: [{ binding: 'ANALYTICS', dataset: 'demo-events' }],
          services: [{ binding: 'AUTH', service: 'shared-auth' }],
          durableObjects: [{ binding: 'ROOMS', namespaceId: 'namespace-1' }],
          ai: [{ binding: 'AI', projectId: 'project-1' }],
          browser: [{ binding: 'BROWSER' }],
        },
      }),
    }], 'demo');

    expect(manifest?.bindings.d1[0].migrations).toBe('db/migrations');
    expect(manifest?.bindings.services[0].environment).toBe('production');
  });

  test('rejects duplicate binding names across resource types', () => {
    expect(() => parseCloudflareManifest([{
      path: 'cloudflare.json',
      content: JSON.stringify({
        version: 1,
        bindings: {
          kv: [{ binding: 'DATA', name: 'demo-cache' }],
          r2: [{ binding: 'DATA', name: 'demo-files' }],
        },
      }),
    }], 'demo')).toThrow('duplicate binding DATA');
  });

  test('keeps legacy migrations working without a manifest', () => {
    const manifest = parseCloudflareManifest([
      { path: 'migrations/0001_init.sql', content: 'CREATE TABLE users(id INTEGER);' },
    ], 'demo');

    expect(manifest?.bindings.d1).toEqual([
      { binding: 'DB', name: 'demo-db', migrations: 'migrations' },
    ]);
  });

  test('falls back safely when stored state is invalid', () => {
    expect(parseCloudflareResourceState('{broken')).toEqual({ version: 1 });
  });
});
