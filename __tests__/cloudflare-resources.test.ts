import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseCloudflareManifest, type CloudflareResourceState } from '@/lib/cloudflare-manifest';
import { buildCloudflarePagesConfig, provisionCloudflareResources } from '@/lib/cloudflare-resources';

function envelope(result: unknown) {
  return new Response(JSON.stringify({ success: true, result, errors: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function manifest(bindings: Record<string, unknown>) {
  return parseCloudflareManifest([
    { path: 'cloudflare.json', content: JSON.stringify({ version: 1, bindings }) },
  ], 'demo')!;
}

describe('Cloudflare resources', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('requires confirmation before creating a resource', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(envelope([]));

    await expect(provisionCloudflareResources({
      token: 'token',
      accountId: 'account',
      manifest: manifest({ kv: [{ binding: 'CACHE', name: 'demo-cache' }] }),
      state: { version: 1 },
      allowCreate: false,
      onStateChange: async () => undefined,
    })).rejects.toThrow('requires confirmation');
  });

  test('creates and persists a KV namespace once', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(envelope([]))
      .mockResolvedValueOnce(envelope({ id: 'kv-1', title: 'demo-cache' }));
    let saved: CloudflareResourceState = { version: 1 };
    const config = manifest({ kv: [{ binding: 'CACHE', name: 'demo-cache' }] });

    saved = await provisionCloudflareResources({
      token: 'token',
      accountId: 'account',
      manifest: config,
      state: saved,
      allowCreate: true,
      onStateChange: async (state) => { saved = structuredClone(state); },
    });
    await provisionCloudflareResources({
      token: 'token',
      accountId: 'account',
      manifest: config,
      state: saved,
      allowCreate: true,
      onStateChange: async () => undefined,
    });

    expect(saved.kv?.CACHE).toEqual({ id: 'kv-1', name: 'demo-cache' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('builds the complete Pages binding payload', () => {
    const config = buildCloudflarePagesConfig(manifest({
      d1: [{ binding: 'DB', name: 'demo-db' }],
      kv: [{ binding: 'CACHE', name: 'demo-cache' }],
      r2: [{ binding: 'UPLOADS', name: 'demo-files' }],
      queues: [{ binding: 'JOBS', name: 'demo-jobs' }],
      vectorize: [{ binding: 'SEARCH', name: 'demo-search', dimensions: 768, metric: 'cosine' }],
      analyticsEngine: [{ binding: 'EVENTS', dataset: 'demo-events' }],
      services: [{ binding: 'AUTH', service: 'auth-worker' }],
      durableObjects: [{ binding: 'ROOMS', namespaceId: 'do-1' }],
      ai: [{ binding: 'AI', projectId: 'ai-1' }],
      browser: [{ binding: 'BROWSER' }],
    }), {
      version: 1,
      d1: { DB: { id: 'db-1', name: 'demo-db' } },
      kv: { CACHE: { id: 'kv-1', name: 'demo-cache' } },
    });

    expect(config).toMatchObject({
      d1_databases: { DB: { id: 'db-1' } },
      kv_namespaces: { CACHE: { namespace_id: 'kv-1' } },
      r2_buckets: { UPLOADS: { name: 'demo-files' } },
      queue_producers: { JOBS: { name: 'demo-jobs' } },
      vectorize_bindings: { SEARCH: { index_name: 'demo-search' } },
      analytics_engine_datasets: { EVENTS: { dataset: 'demo-events' } },
      services: { AUTH: { service: 'auth-worker', environment: 'production' } },
      durable_object_namespaces: { ROOMS: { namespace_id: 'do-1' } },
      ai_bindings: { AI: { project_id: 'ai-1' } },
      browsers: { BROWSER: {} },
    });
  });
});
