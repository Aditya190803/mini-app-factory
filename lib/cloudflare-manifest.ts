import { z } from 'zod';

type DeployFile = { path: string; content: string };

const binding = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'must be an uppercase Worker binding name');
const name = z.string().trim().min(1).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'must use lowercase letters, numbers, and hyphens');
const bindingWithName = z.object({ binding, name }).strict();

export const cloudflareManifestSchema = z.object({
  version: z.literal(1),
  compatibilityDate: z.string().date().default('2026-08-09'),
  compatibilityFlags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  bindings: z.object({
    d1: z.array(bindingWithName.extend({ migrations: z.string().trim().min(1).default('migrations') }).strict()).max(10).default([]),
    kv: z.array(bindingWithName).max(20).default([]),
    r2: z.array(bindingWithName.extend({ jurisdiction: z.enum(['default', 'eu', 'fedramp', 'fedramp-high']).optional() }).strict()).max(20).default([]),
    queues: z.array(bindingWithName).max(20).default([]),
    vectorize: z.array(bindingWithName.extend({
      dimensions: z.number().int().min(2).max(1536),
      metric: z.enum(['cosine', 'euclidean', 'dot-product']),
      description: z.string().max(100).optional(),
    }).strict()).max(10).default([]),
    analyticsEngine: z.array(z.object({ binding, dataset: name }).strict()).max(20).default([]),
    services: z.array(z.object({
      binding,
      service: name,
      environment: z.string().trim().min(1).max(63).default('production'),
      entrypoint: z.string().trim().min(1).max(100).optional(),
    }).strict()).max(20).default([]),
    durableObjects: z.array(z.object({ binding, namespaceId: z.string().trim().min(1).max(64) }).strict()).max(20).default([]),
    ai: z.array(z.object({ binding, projectId: z.string().trim().min(1).max(100) }).strict()).max(10).default([]),
    browser: z.array(z.object({ binding }).strict()).max(5).default([]),
  }).strict(),
  workers: z.array(z.object({
    name,
    source: z.string().trim().regex(/^workers\/[a-zA-Z0-9._/-]+\.js$/, 'must be a JavaScript file under workers/'),
    bindings: z.array(binding).max(50).default([]),
    serviceBinding: binding.optional(),
    crons: z.array(z.string().trim().min(9).max(100)).max(20).default([]),
    queueConsumers: z.array(z.object({
      queue: binding,
      batchSize: z.number().int().min(1).max(100).optional(),
      maxConcurrency: z.number().int().min(1).max(10).optional(),
      maxRetries: z.number().int().min(0).max(100).optional(),
      maxWaitTimeMs: z.number().int().min(0).max(60_000).optional(),
      deadLetterQueue: z.string().trim().min(1).max(63).optional(),
    }).strict()).max(20).default([]),
    durableObjects: z.array(z.object({
      binding,
      className: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
      sqlite: z.boolean().default(true),
    }).strict()).max(20).default([]),
    compatibilityDate: z.string().date().optional(),
    compatibilityFlags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    observability: z.boolean().default(true),
  }).strict()).max(10).default([]),
}).strict();

export type CloudflareManifest = z.infer<typeof cloudflareManifestSchema>;
export type CloudflareResourceKind = 'd1' | 'kv' | 'r2' | 'queue' | 'vectorize' | 'worker' | 'durableObject';
const idResource = z.object({ id: z.string().min(1), name: z.string().min(1) }).strict();
const cloudflareResourceStateSchema = z.object({
  version: z.literal(1),
  d1: z.record(idResource).optional(),
  kv: z.record(idResource).optional(),
  r2: z.record(z.object({ name: z.string().min(1), jurisdiction: z.string().optional() }).strict()).optional(),
  queue: z.record(idResource).optional(),
  vectorize: z.record(z.object({ name: z.string().min(1) }).strict()).optional(),
  worker: z.record(z.object({
    name: z.string().min(1),
    source: z.string().min(1),
    migrationTag: z.string().optional(),
    classes: z.array(z.string()).optional(),
  }).strict()).optional(),
  durableObject: z.record(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    worker: z.string().min(1),
    className: z.string().min(1),
  }).strict()).optional(),
}).strict();

export type CloudflareResourceState = z.infer<typeof cloudflareResourceStateSchema>;

export function emptyCloudflareResourceState(): CloudflareResourceState {
  return { version: 1 };
}

export function parseCloudflareResourceState(value?: string): CloudflareResourceState {
  if (!value) return emptyCloudflareResourceState();
  try {
    const parsed = cloudflareResourceStateSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : emptyCloudflareResourceState();
  } catch {
    return emptyCloudflareResourceState();
  }
}

function migrationPath(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').includes('..')) throw new Error('cloudflare.json contains an invalid migrations path');
  return normalized;
}

export function parseCloudflareManifest(files: DeployFile[], projectName: string): CloudflareManifest | null {
  const config = files.find((file) => file.path.replace(/^\/+/, '') === 'cloudflare.json');
  let manifest: CloudflareManifest;

  if (config) {
    let value: unknown;
    try {
      value = JSON.parse(config.content);
    } catch {
      throw new Error('cloudflare.json is not valid JSON');
    }
    const parsed = cloudflareManifestSchema.safeParse(value);
    if (!parsed.success) throw new Error(`Invalid cloudflare.json: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    manifest = parsed.data;
  } else if (files.some((file) => file.path.startsWith('migrations/') && file.path.endsWith('.sql'))) {
    const resourceName = `${projectName}-db`.slice(0, 63).replace(/-+$/g, '');
    manifest = cloudflareManifestSchema.parse({
      version: 1,
      bindings: { d1: [{ binding: 'DB', name: resourceName, migrations: 'migrations' }] },
    });
  } else {
    return null;
  }

  const seen = new Set<string>();
  for (const entries of Object.values(manifest.bindings)) {
    for (const entry of entries) {
      if (seen.has(entry.binding)) throw new Error(`Invalid cloudflare.json: duplicate binding ${entry.binding}`);
      seen.add(entry.binding);
      if ('migrations' in entry) entry.migrations = migrationPath(entry.migrations);
    }
  }

  const workerNames = new Set<string>();
  const queueBindings = new Set(manifest.bindings.queues.map((item) => item.binding));
  for (const worker of manifest.workers) {
    if (workerNames.has(worker.name)) throw new Error(`Invalid cloudflare.json: duplicate Worker ${worker.name}`);
    workerNames.add(worker.name);
    worker.source = migrationPath(worker.source);
    if (!files.some((file) => file.path.replace(/^\/+/, '') === worker.source)) {
      throw new Error(`Invalid cloudflare.json: Worker source not found: ${worker.source}`);
    }
    for (const referencedBinding of worker.bindings) {
      if (!seen.has(referencedBinding)) throw new Error(`Invalid cloudflare.json: unknown binding ${referencedBinding} in Worker ${worker.name}`);
    }
    for (const consumer of worker.queueConsumers) {
      if (!queueBindings.has(consumer.queue)) throw new Error(`Invalid cloudflare.json: unknown Queue binding ${consumer.queue}`);
    }
    if (worker.serviceBinding) {
      if (seen.has(worker.serviceBinding)) throw new Error(`Invalid cloudflare.json: duplicate binding ${worker.serviceBinding}`);
      seen.add(worker.serviceBinding);
    }
    for (const durableObject of worker.durableObjects) {
      if (seen.has(durableObject.binding)) throw new Error(`Invalid cloudflare.json: duplicate binding ${durableObject.binding}`);
      seen.add(durableObject.binding);
    }
  }
  return manifest;
}
