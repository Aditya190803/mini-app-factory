import { describe, expect, test } from 'vitest';
import {
  parseCloudflareManifest,
  parseCloudflareResourceState,
} from '@/lib/cloudflare-manifest';

describe('Cloudflare resource manifest', () => {
  test('parses Wrangler JSONC as the deployment source of truth', () => {
    const manifest = parseCloudflareManifest([
      { path: '_worker.js', content: 'export default { fetch() {} }' },
      { path: 'migrations/0001_init.sql', content: 'CREATE TABLE tasks(id TEXT PRIMARY KEY);' },
      {
        path: 'wrangler.jsonc',
        content: `{
          // Resource IDs are resolved during deployment.
          "name": "task-app",
          "main": "_worker.js",
          "compatibility_date": "2026-08-09",
          "d1_databases": [{
            "binding": "DB",
            "database_name": "task-app-db",
            "migrations_dir": "migrations",
          }],
          "observability": { "enabled": true },
        }`,
      },
    ], 'task-app');

    expect(manifest?.bindings.d1).toEqual([
      { binding: 'DB', name: 'task-app-db', migrations: 'migrations' },
    ]);
    expect(manifest?.workers).toEqual([]);
  });

  test('rejects a Wrangler config whose entrypoint does not exist', () => {
    expect(() => parseCloudflareManifest([
      { path: 'wrangler.jsonc', content: '{ "name": "demo", "main": "missing.js" }' },
    ], 'demo')).toThrow('Worker entrypoint not found');
  });

  test('parses companion Wrangler projects for queues, cron, and Durable Objects', () => {
    const manifest = parseCloudflareManifest([
      { path: '_worker.js', content: 'export default { fetch(request, env) { return env.ASSETS.fetch(request); } }' },
      { path: 'wrangler.jsonc', content: '{"name":"demo","main":"_worker.js"}' },
      { path: 'workers/jobs/index.js', content: 'export class Room {}; export default { queue() {}, scheduled() {} }' },
      { path: 'workers/jobs/wrangler.jsonc', content: JSON.stringify({
        name: 'demo-jobs',
        main: 'index.js',
        queues: { consumers: [{ queue: 'demo-jobs', max_retries: 4, dead_letter_queue: 'demo-jobs-dlq' }] },
        triggers: { crons: ['0 3 * * *'] },
        durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room' }] },
      }) },
    ], 'demo');
    expect(manifest?.workers[0]).toEqual(expect.objectContaining({
      name: 'demo-jobs',
      source: 'workers/jobs/index.js',
      crons: ['0 3 * * *'],
      queueConsumers: [expect.objectContaining({ queue: 'DEMO_JOBS', maxRetries: 4 })],
      durableObjects: [expect.objectContaining({ binding: 'ROOMS', className: 'Room' })],
    }));
  });

  test('uses the root Wrangler config regardless of file order', () => {
    const manifest = parseCloudflareManifest([
      { path: 'workers/jobs/index.js', content: 'export default { queue() {} }' },
      { path: 'workers/jobs/wrangler.jsonc', content: '{"name":"demo-jobs","main":"index.js"}' },
      { path: '_worker.js', content: 'export default { fetch(request, env) { return env.ASSETS.fetch(request); } }' },
      { path: 'wrangler.jsonc', content: '{"name":"demo","main":"_worker.js","compatibility_date":"2026-08-09"}' },
    ], 'demo');

    expect(manifest?.compatibilityDate).toBe('2026-08-09');
    expect(manifest?.workers).toHaveLength(1);
  });

  test('rejects conflicting bindings across Wrangler projects', () => {
    expect(() => parseCloudflareManifest([
      { path: '_worker.js', content: 'export default { fetch() {} }' },
      { path: 'wrangler.jsonc', content: '{"name":"demo","main":"_worker.js","kv_namespaces":[{"binding":"DATA"}]}' },
      { path: 'workers/jobs/index.js', content: 'export default { fetch() {} }' },
      { path: 'workers/jobs/wrangler.jsonc', content: '{"name":"jobs","main":"index.js","r2_buckets":[{"binding":"DATA","bucket_name":"jobs-data"}]}' },
    ], 'demo')).toThrow('duplicate binding DATA');
  });

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

  test('validates companion Worker sources and binding references', () => {
    const manifest = parseCloudflareManifest([
      { path: 'workers/jobs.js', content: 'export default { queue() {} };' },
      {
        path: 'cloudflare.json',
        content: JSON.stringify({
          version: 1,
          bindings: { queues: [{ binding: 'JOBS', name: 'demo-jobs' }] },
          workers: [{
            name: 'demo-jobs-worker',
            source: 'workers/jobs.js',
            bindings: ['JOBS'],
            queueConsumers: [{ queue: 'JOBS' }],
            durableObjects: [{ binding: 'ROOMS', className: 'Room' }],
            crons: ['*/5 * * * *'],
          }],
        }),
      },
    ], 'demo');

    expect(manifest?.workers[0]).toMatchObject({ name: 'demo-jobs-worker', observability: true });
  });

  test('falls back safely when stored state is invalid', () => {
    expect(parseCloudflareResourceState('{broken')).toEqual({ version: 1 });
  });
});
