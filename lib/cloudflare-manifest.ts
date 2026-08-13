import { z } from 'zod';

type DeployFile = { path: string; content: string };

const binding = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'must be an uppercase Worker binding name');
const name = z.string().trim().min(1).max(63).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'must use lowercase letters, numbers, and hyphens');
const wranglerBinding = z.object({ binding, }).passthrough();

const wranglerConfigSchema = z.object({
  name: name.optional(),
  main: z.string().trim().min(1).default('_worker.js'),
  compatibility_date: z.string().date().default('2026-08-09'),
  compatibility_flags: z.array(z.string()).optional(),
  observability: z.union([z.boolean(), z.object({ enabled: z.boolean().default(true) }).passthrough()]).optional(),
  d1_databases: z.array(wranglerBinding.extend({ database_name: name, migrations_dir: z.string().default('migrations') })).default([]),
  kv_namespaces: z.array(wranglerBinding.extend({ id: z.string().optional() })).default([]),
  r2_buckets: z.array(wranglerBinding.extend({ bucket_name: name, jurisdiction: z.string().optional() })).default([]),
  queues: z.object({
    producers: z.array(wranglerBinding.extend({ queue: name })).default([]),
    consumers: z.array(z.object({
      queue: name,
      max_batch_size: z.number().int().min(1).max(100).optional(),
      max_batch_timeout: z.number().int().min(0).max(60).optional(),
      max_retries: z.number().int().min(0).max(100).optional(),
      dead_letter_queue: name.optional(),
      max_concurrency: z.number().int().min(1).max(10).optional(),
    }).passthrough()).default([]),
  }).passthrough().optional(),
  triggers: z.object({ crons: z.array(z.string().trim().min(9).max(100)).default([]) }).passthrough().optional(),
  durable_objects: z.object({ bindings: z.array(z.object({ name: binding, class_name: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/), script_name: name.optional() }).passthrough()).default([]) }).passthrough().optional(),
  vectorize: z.array(wranglerBinding.extend({ index_name: name, dimensions: z.number().int().min(2).max(1536).optional(), metric: z.enum(['cosine', 'euclidean', 'dot-product']).optional() })).default([]),
  analytics_engine_datasets: z.array(wranglerBinding.extend({ dataset: name })).default([]),
  services: z.array(wranglerBinding.extend({ service: name, environment: z.string().optional(), entrypoint: z.string().optional() })).default([]),
  ai: wranglerBinding.optional(),
  browser: wranglerBinding.optional(),
}).passthrough();

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
    source: z.string().trim().regex(/^(?:_worker\.js|workers\/[a-zA-Z0-9._/-]+\.js)$/, 'must be _worker.js or a JavaScript file under workers/'),
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
  migrationHashes: z.record(z.string().min(8)).optional(),
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

/** JSONC parser for generated Wrangler files. Handles comments and trailing commas without a dependency. */
export function parseJsonc(source: string): unknown {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      output += '\n';
    } else if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
    } else {
      output += char;
    }
  }
  return JSON.parse(output.replace(/,\s*([}\]])/g, '$1'));
}

function manifestFromWrangler(file: DeployFile, files: DeployFile[], projectName: string): CloudflareManifest {
  let value: unknown;
  try {
    value = parseJsonc(file.content);
  } catch {
    throw new Error('wrangler.jsonc is not valid JSONC');
  }
  const parsed = wranglerConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid wrangler.jsonc: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const config = parsed.data;
  const configPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
  const configDir = configPath.includes('/') ? configPath.slice(0, configPath.lastIndexOf('/')) : '';
  const configuredMain = migrationPath(config.main);
  const main = configDir && !configuredMain.startsWith(`${configDir}/`) ? `${configDir}/${configuredMain}` : configuredMain;
  if (!files.some((candidate) => candidate.path.replace(/^\/+/, '') === main)) {
    throw new Error(`Invalid wrangler.jsonc: Worker entrypoint not found: ${main}`);
  }
  const workerName = config.name || projectName;
  const queueBindings = config.queues?.producers ?? [];
  const consumers = config.queues?.consumers ?? [];
  const consumerBindings = consumers.map((consumer) => ({
    binding: consumer.queue.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
    name: consumer.queue,
  }));
  const deadLetterBindings = consumers.flatMap((consumer) => consumer.dead_letter_queue ? [{
    binding: consumer.dead_letter_queue.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
    name: consumer.dead_letter_queue,
  }] : []);
  const durableObjects = config.durable_objects?.bindings ?? [];
  const isPagesEntrypoint = main === '_worker.js';
  return cloudflareManifestSchema.parse({
    version: 1,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    bindings: {
      d1: config.d1_databases.map((item) => ({ binding: item.binding, name: item.database_name, migrations: item.migrations_dir })),
      kv: config.kv_namespaces.map((item) => ({ binding: item.binding, name: `${workerName}-${item.binding.toLowerCase()}`.slice(0, 63) })),
      r2: config.r2_buckets.map((item) => ({ binding: item.binding, name: item.bucket_name, jurisdiction: item.jurisdiction })),
      queues: [...queueBindings.map((item) => ({ binding: item.binding, name: item.queue })), ...consumerBindings, ...deadLetterBindings]
        .filter((item, index, all) => all.findIndex((candidate) => candidate.binding === item.binding) === index),
      vectorize: config.vectorize.map((item) => {
        if (!item.dimensions || !item.metric) throw new Error(`Invalid wrangler.jsonc: Vectorize binding ${item.binding} needs dimensions and metric for provisioning`);
        return { binding: item.binding, name: item.index_name, dimensions: item.dimensions, metric: item.metric };
      }),
      analyticsEngine: config.analytics_engine_datasets.map((item) => ({ binding: item.binding, dataset: item.dataset })),
      services: config.services.map((item) => ({ binding: item.binding, service: item.service, environment: item.environment || 'production', entrypoint: item.entrypoint })),
      durableObjects: [],
      ai: config.ai ? [{ binding: config.ai.binding, projectId: workerName }] : [],
      browser: config.browser ? [{ binding: config.browser.binding }] : [],
    },
    workers: isPagesEntrypoint ? [] : [{
      name: workerName,
      source: main,
      bindings: [
        ...config.d1_databases,
        ...config.kv_namespaces,
        ...config.r2_buckets,
        ...queueBindings,
        ...config.analytics_engine_datasets,
        ...config.services,
        ...(config.ai ? [config.ai] : []),
        ...(config.browser ? [config.browser] : []),
      ].map((item) => item.binding),
      crons: config.triggers?.crons ?? [],
      queueConsumers: consumers.map((consumer) => ({
        queue: consumer.queue.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
        batchSize: consumer.max_batch_size,
        maxWaitTimeMs: consumer.max_batch_timeout === undefined ? undefined : consumer.max_batch_timeout * 1000,
        maxRetries: consumer.max_retries,
        maxConcurrency: consumer.max_concurrency,
        deadLetterQueue: consumer.dead_letter_queue,
      })),
      durableObjects: durableObjects.filter((item) => !item.script_name).map((item) => ({ binding: item.name, className: item.class_name, sqlite: true })),
      observability: typeof config.observability === 'boolean' ? config.observability : config.observability?.enabled ?? true,
    }],
  });
}

export function parseCloudflareManifest(files: DeployFile[], projectName: string): CloudflareManifest | null {
  const wranglers = files
    .filter((file) => /(^|\/)wrangler\.jsonc?$/.test(file.path.replace(/^\/+/, '')))
    .sort((left, right) => {
      const leftPath = left.path.replace(/^\/+/, '');
      const rightPath = right.path.replace(/^\/+/, '');
      const leftDepth = leftPath.split('/').length;
      const rightDepth = rightPath.split('/').length;
      return leftDepth - rightDepth || leftPath.localeCompare(rightPath);
    });
  const config = files.find((file) => file.path.replace(/^\/+/, '') === 'cloudflare.json');
  let manifest: CloudflareManifest;

  if (wranglers.length) {
    const manifests = wranglers.map((wrangler) => manifestFromWrangler(wrangler, files, projectName));
    const root = manifests[0];
    const mergedBindings = Object.fromEntries(Object.keys(root.bindings).map((key) => {
      const entries = manifests.flatMap((item) => item.bindings[key as keyof typeof item.bindings]);
      const byBinding = new Map<string, (typeof entries)[number]>();
      for (const entry of entries) {
        const existing = byBinding.get(entry.binding);
        if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
          throw new Error(`Invalid wrangler.jsonc: conflicting definitions for binding ${entry.binding}`);
        }
        byBinding.set(entry.binding, entry);
      }
      return [key, [...byBinding.values()]];
    }));
    manifest = cloudflareManifestSchema.parse({
      ...root,
      bindings: mergedBindings,
      workers: manifests.flatMap((item) => item.workers),
    });
  } else if (config) {
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
