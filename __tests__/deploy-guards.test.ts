import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { disallowedMigrationStatements, scopeCloudflareManifest, scopeResourceName, splitSqlStatements, cloudflareManifestSchema } from '@/lib/cloudflare-manifest';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
import { userContentHeaders } from '@/lib/user-content-headers';

describe('migration allowlist', () => {
  it.each([
    'CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, title TEXT);',
    'CREATE UNIQUE INDEX idx ON todos(title);',
    'ALTER TABLE todos ADD COLUMN done INTEGER DEFAULT 0;',
    "INSERT INTO todos (title) VALUES ('a; b');",
    "INSERT OR IGNORE INTO todos (title) VALUES ('seed');",
    '-- comment\nCREATE VIEW open AS SELECT * FROM todos WHERE done = 0;',
  ])('allows %s', (sql) => {
    expect(disallowedMigrationStatements(sql)).toEqual([]);
  });

  it.each([
    'DROP TABLE todos;',
    'DELETE FROM todos WHERE 1=1;',
    'UPDATE todos SET title = NULL;',
    'DROP VIEW open;',
    'ALTER TABLE todos DROP COLUMN title;',
    "INSERT OR REPLACE INTO todos (id) VALUES (1);",
    'PRAGMA foreign_keys = OFF;',
    'CREATE TRIGGER t AFTER INSERT ON todos BEGIN DELETE FROM todos; END;',
    '/* looks harmless */ DELETE FROM todos',
  ])('rejects %s', (sql) => {
    expect(disallowedMigrationStatements(sql).length).toBeGreaterThan(0);
  });

  it('does not split on semicolons inside strings or comments', () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('x;y'); -- a;b\nSELECT 1")).toEqual(["INSERT INTO t VALUES ('x;y')", 'SELECT 1']);
  });
});

describe('Cloudflare resource scoping', () => {
  const manifest = cloudflareManifestSchema.parse({
    version: 1,
    bindings: {
      d1: [{ binding: 'DB', name: 'todo-db' }],
      kv: [{ binding: 'CACHE', name: 'cache' }],
      queues: [{ binding: 'JOBS', name: 'jobs' }],
      services: [{ binding: 'API', service: 'api' }],
    },
    workers: [{ name: 'api', source: '_worker.js', queueConsumers: [{ queue: 'JOBS', deadLetterQueue: 'jobs' }] }],
  });

  it('prefixes every account-level name with the project', () => {
    const scoped = scopeCloudflareManifest(manifest, 'my-app', { version: 1 });
    expect(scoped.bindings.d1[0]!.name).toBe('my-app-todo-db');
    expect(scoped.bindings.kv[0]!.name).toBe('my-app-cache');
    expect(scoped.workers[0]!.name).toBe('my-app-api');
    // References inside the manifest follow the rename.
    expect(scoped.bindings.services[0]!.service).toBe('my-app-api');
    expect(scoped.workers[0]!.queueConsumers[0]!.deadLetterQueue).toBe('my-app-jobs');
  });

  it('keeps names already recorded in this project\'s state, so existing data is not orphaned', () => {
    const scoped = scopeCloudflareManifest(manifest, 'my-app', { version: 1, d1: { DB: { id: 'uuid', name: 'todo-db' } } });
    expect(scoped.bindings.d1[0]!.name).toBe('todo-db');
    expect(scoped.bindings.kv[0]!.name).toBe('my-app-cache');
  });

  it('two projects with the same model-written name get different resources', () => {
    expect(scopeResourceName('app-one', 'todo-db')).not.toBe(scopeResourceName('app-two', 'todo-db'));
  });

  it('keeps long names within 63 characters, distinct, and without a trailing hyphen', () => {
    const scope = 'a'.repeat(50);
    const one = scopeResourceName(scope, 'database-number-one');
    const two = scopeResourceName(scope, 'database-number-two');
    expect(one).not.toBe(two);
    for (const name of [one, two]) expect(name).toMatch(/^[a-z0-9-]{1,63}$/);
  });
});

describe('secret box', () => {
  it('a bound ciphertext only decrypts under its own context', () => {
    const blob = encryptSecret('{"API_KEY":"s3cret"}', 'cloudflare-env:victim');
    expect(blob.startsWith('maf2.')).toBe(true);
    expect(decryptSecret(blob, 'cloudflare-env:victim')).toBe('{"API_KEY":"s3cret"}');
    expect(decryptSecret(blob, 'cloudflare-env:attacker')).toBeNull();
    expect(decryptSecret(blob)).toBeNull();
  });

  it('still reads legacy unbound values', () => {
    const legacy = encryptSecret('old');
    expect(decryptSecret(legacy, 'cloudflare-env:any')).toBe('old');
  });
});

describe('user content headers', () => {
  it('sandboxes, forbids framing by other sites, and asks not to be indexed', () => {
    const headers = userContentHeaders('text/html');
    expect(headers['Content-Security-Policy']).toMatch(/^sandbox /);
    expect(headers['Content-Security-Policy']).not.toContain('allow-same-origin');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'self'");
    expect(headers['X-Robots-Tag']).toContain('noindex');
  });
});

describe('rate limiter', () => {
  it('fails closed when Convex cannot be reached', async () => {
    vi.doMock('@/lib/convex-server', () => ({ getAuthedConvexClient: async () => { throw new Error('down'); } }));
    const { consumeRateLimit } = await import('@/lib/rate-limit');
    const result = await consumeRateLimit('generate', 'user_1', ['ai-daily']);
    expect(result.allowed).toBe(false);
    vi.doUnmock('@/lib/convex-server');
  });

  it('labels exhausted quotas so the client can offer BYOK', async () => {
    const { rateLimitedResponse } = await import('@/lib/rate-limit');
    const response = rateLimitedResponse({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, bucket: 'ai-daily' });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });
});
