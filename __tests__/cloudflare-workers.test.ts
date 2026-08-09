import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseCloudflareManifest } from '@/lib/cloudflare-manifest';
import { deployCloudflareWorkers } from '@/lib/cloudflare-workers';
import { buildCloudflarePagesConfig } from '@/lib/cloudflare-resources';

function envelope(result: unknown) {
  return new Response(JSON.stringify({ success: true, result, errors: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const files = [
  { path: 'workers/jobs.js', content: 'export class Room {}; export default { queue() {}, scheduled() {} };' },
  {
    path: 'cloudflare.json',
    content: JSON.stringify({
      version: 1,
      bindings: { queues: [{ binding: 'JOBS', name: 'demo-jobs' }] },
      workers: [{
        name: 'demo-worker',
        source: 'workers/jobs.js',
        bindings: ['JOBS'],
        crons: ['*/5 * * * *'],
        queueConsumers: [{ queue: 'JOBS', batchSize: 10 }],
        durableObjects: [{ binding: 'ROOMS', className: 'Room' }],
        serviceBinding: 'WORKER',
      }],
    }),
  },
];

describe('Cloudflare companion Workers', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('requires confirmation for a new Worker', async () => {
    await expect(deployCloudflareWorkers({
      token: 'token',
      accountId: 'account',
      manifest: parseCloudflareManifest(files, 'demo')!,
      state: { version: 1, queue: { JOBS: { id: 'queue-1', name: 'demo-jobs' } } },
      files,
      secrets: {},
      allowCreate: false,
      onStateChange: async () => undefined,
    })).rejects.toThrow('requires confirmation');
  });

  test('uploads modules, schedules cron, registers queue consumers, and resolves Durable Objects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/workers/scripts/demo-worker')) {
        const form = init?.body as FormData;
        const metadata = JSON.parse(await (form.get('metadata') as Blob).text());
        expect(metadata).toMatchObject({
          main_module: 'worker.js',
          migrations: { new_tag: 'v1', new_sqlite_classes: ['Room'] },
        });
        expect(metadata.bindings).toContainEqual({ name: 'JOBS', type: 'queue', queue_name: 'demo-jobs' });
        return envelope({});
      }
      if (url.endsWith('/schedules')) {
        expect(JSON.parse(String(init?.body))).toEqual([{ cron: '*/5 * * * *' }]);
        return envelope([]);
      }
      if (url.endsWith('/queues/queue-1/consumers') && init?.method === undefined) return envelope([]);
      if (url.endsWith('/queues/queue-1/consumers') && init?.method === 'POST') return envelope({ consumer_id: 'consumer-1' });
      if (url.includes('/workers/durable_objects/namespaces')) {
        return envelope([{ id: 'do-1', class: 'Room', name: 'Room', script: 'demo-worker' }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    let saved = { version: 1 } as Awaited<ReturnType<typeof deployCloudflareWorkers>>;

    saved = await deployCloudflareWorkers({
      token: 'token',
      accountId: 'account',
      manifest: parseCloudflareManifest(files, 'demo')!,
      state: { version: 1, queue: { JOBS: { id: 'queue-1', name: 'demo-jobs' } } },
      files,
      secrets: {},
      allowCreate: true,
      onStateChange: async (state) => { saved = structuredClone(state); },
    });

    expect(saved.worker?.['demo-worker']?.migrationTag).toBe('v1');
    expect(saved.durableObject?.ROOMS.id).toBe('do-1');
    expect(buildCloudflarePagesConfig(parseCloudflareManifest(files, 'demo')!, saved)).toMatchObject({
      services: { WORKER: { service: 'demo-worker' } },
      durable_object_namespaces: { ROOMS: { namespace_id: 'do-1' } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
