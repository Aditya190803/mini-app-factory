import 'server-only';

import { CloudflareApiError, cloudflareRequest, createCloudflareD1Database } from '@/lib/cloudflare';
import type { CloudflareManifest, CloudflareResourceKind, CloudflareResourceState } from '@/lib/cloudflare-manifest';

export type CloudflareResourceAction = {
  kind: CloudflareResourceKind | 'external';
  binding: string;
  name: string;
  action: 'reuse' | 'create' | 'reference';
};

export type CloudflarePagesConfig = Record<string, unknown>;

type ResourceParams = { token: string; accountId: string };
const encode = encodeURIComponent;

async function findD1(params: ResourceParams, name: string) {
  const databases = await cloudflareRequest<Array<{ uuid: string; name: string }>>(
    `/accounts/${encode(params.accountId)}/d1/database?name=${encode(name)}&per_page=10`, params.token
  );
  return databases.find((database) => database.name === name);
}

async function findKv(params: ResourceParams, name: string) {
  const namespaces = await cloudflareRequest<Array<{ id: string; title: string }>>(
    `/accounts/${encode(params.accountId)}/storage/kv/namespaces?per_page=1000`, params.token
  );
  return namespaces.find((namespace) => namespace.title === name);
}

async function findR2(params: ResourceParams, name: string, jurisdiction?: string) {
  const result = await cloudflareRequest<{ buckets: Array<{ name: string; jurisdiction?: string }> }>(
    `/accounts/${encode(params.accountId)}/r2/buckets?name_contains=${encode(name)}&per_page=100`, params.token,
    jurisdiction && jurisdiction !== 'default' ? { headers: { 'cf-r2-jurisdiction': jurisdiction } } : undefined
  );
  return result.buckets.find((bucket) => bucket.name === name);
}

async function findQueue(params: ResourceParams, name: string) {
  const queues = await cloudflareRequest<Array<{ queue_id: string; queue_name: string }>>(
    `/accounts/${encode(params.accountId)}/queues`, params.token
  );
  return queues.find((queue) => queue.queue_name === name);
}

async function findVectorize(params: ResourceParams, name: string) {
  try {
    return await cloudflareRequest<{ name: string }>(
      `/accounts/${encode(params.accountId)}/vectorize/v2/indexes/${encode(name)}`, params.token
    );
  } catch (error) {
    if (error instanceof CloudflareApiError && error.status === 404) return undefined;
    throw error;
  }
}

export async function planCloudflareResources(params: ResourceParams & {
  manifest: CloudflareManifest;
  state: CloudflareResourceState;
}): Promise<CloudflareResourceAction[]> {
  const actions: CloudflareResourceAction[] = [];

  for (const resource of params.manifest.bindings.d1) {
    const stored = params.state.d1?.[resource.binding];
    const existing = stored?.name === resource.name ? stored : await findD1(params, resource.name);
    actions.push({ kind: 'd1', binding: resource.binding, name: resource.name, action: existing ? 'reuse' : 'create' });
  }
  for (const resource of params.manifest.bindings.kv) {
    const stored = params.state.kv?.[resource.binding];
    const existing = stored?.name === resource.name ? stored : await findKv(params, resource.name);
    actions.push({ kind: 'kv', binding: resource.binding, name: resource.name, action: existing ? 'reuse' : 'create' });
  }
  for (const resource of params.manifest.bindings.r2) {
    const stored = params.state.r2?.[resource.binding];
    const existing = stored?.name === resource.name ? stored : await findR2(params, resource.name, resource.jurisdiction);
    actions.push({ kind: 'r2', binding: resource.binding, name: resource.name, action: existing ? 'reuse' : 'create' });
  }
  for (const resource of params.manifest.bindings.queues) {
    const stored = params.state.queue?.[resource.binding];
    const existing = stored?.name === resource.name ? stored : await findQueue(params, resource.name);
    actions.push({ kind: 'queue', binding: resource.binding, name: resource.name, action: existing ? 'reuse' : 'create' });
  }
  for (const resource of params.manifest.bindings.vectorize) {
    const stored = params.state.vectorize?.[resource.binding];
    const existing = stored?.name === resource.name ? stored : await findVectorize(params, resource.name);
    actions.push({ kind: 'vectorize', binding: resource.binding, name: resource.name, action: existing ? 'reuse' : 'create' });
  }

  const references = [
    ...params.manifest.bindings.analyticsEngine.map((item) => [item.binding, item.dataset]),
    ...params.manifest.bindings.services.map((item) => [item.binding, item.service]),
    ...params.manifest.bindings.durableObjects.map((item) => [item.binding, item.namespaceId]),
    ...params.manifest.bindings.ai.map((item) => [item.binding, item.projectId]),
    ...params.manifest.bindings.browser.map((item) => [item.binding, 'Browser Rendering']),
  ];
  for (const [binding, name] of references) {
    actions.push({ kind: 'external', binding, name, action: 'reference' });
  }
  return actions;
}

export async function provisionCloudflareResources(params: ResourceParams & {
  manifest: CloudflareManifest;
  state: CloudflareResourceState;
  allowCreate: boolean;
  onStateChange: (state: CloudflareResourceState) => Promise<void>;
  onProgress?: (message: string) => void;
}) {
  const state = structuredClone(params.state);
  const save = async () => params.onStateChange(state);

  for (const resource of params.manifest.bindings.d1) {
    let value = state.d1?.[resource.binding];
    if (value?.name !== resource.name) {
      const existing = await findD1(params, resource.name);
      if (!existing && !params.allowCreate) throw new Error('Cloudflare resource creation requires confirmation');
      params.onProgress?.(`Cloudflare: ${existing ? 'Reusing' : 'Creating'} D1 ${resource.name}`);
      const database = existing ?? await createCloudflareD1Database({ ...params, name: resource.name });
      value = { id: database.uuid, name: database.name };
      state.d1 = { ...state.d1, [resource.binding]: value };
      await save();
    }
  }

  for (const resource of params.manifest.bindings.kv) {
    let value = state.kv?.[resource.binding];
    if (value?.name !== resource.name) {
      const existing = await findKv(params, resource.name);
      if (!existing && !params.allowCreate) throw new Error('Cloudflare resource creation requires confirmation');
      params.onProgress?.(`Cloudflare: ${existing ? 'Reusing' : 'Creating'} KV ${resource.name}`);
      const namespace = existing ?? await cloudflareRequest<{ id: string; title: string }>(
        `/accounts/${encode(params.accountId)}/storage/kv/namespaces`, params.token,
        { method: 'POST', body: JSON.stringify({ title: resource.name }) }
      );
      value = { id: namespace.id, name: namespace.title };
      state.kv = { ...state.kv, [resource.binding]: value };
      await save();
    }
  }

  for (const resource of params.manifest.bindings.r2) {
    let value = state.r2?.[resource.binding];
    if (value?.name !== resource.name) {
      const existing = await findR2(params, resource.name, resource.jurisdiction);
      if (!existing && !params.allowCreate) throw new Error('Cloudflare resource creation requires confirmation');
      params.onProgress?.(`Cloudflare: ${existing ? 'Reusing' : 'Creating'} R2 ${resource.name}`);
      const bucket = existing ?? await cloudflareRequest<{ name: string; jurisdiction?: string }>(
        `/accounts/${encode(params.accountId)}/r2/buckets`, params.token,
        {
          method: 'POST',
          headers: resource.jurisdiction && resource.jurisdiction !== 'default' ? { 'cf-r2-jurisdiction': resource.jurisdiction } : undefined,
          body: JSON.stringify({ name: resource.name }),
        }
      );
      value = { name: bucket.name, ...(bucket.jurisdiction ? { jurisdiction: bucket.jurisdiction } : {}) };
      state.r2 = { ...state.r2, [resource.binding]: value };
      await save();
    }
  }

  for (const resource of params.manifest.bindings.queues) {
    let value = state.queue?.[resource.binding];
    if (value?.name !== resource.name) {
      const existing = await findQueue(params, resource.name);
      if (!existing && !params.allowCreate) throw new Error('Cloudflare resource creation requires confirmation');
      params.onProgress?.(`Cloudflare: ${existing ? 'Reusing' : 'Creating'} Queue ${resource.name}`);
      const queue = existing ?? await cloudflareRequest<{ queue_id: string; queue_name: string }>(
        `/accounts/${encode(params.accountId)}/queues`, params.token,
        { method: 'POST', body: JSON.stringify({ queue_name: resource.name }) }
      );
      value = { id: queue.queue_id, name: queue.queue_name };
      state.queue = { ...state.queue, [resource.binding]: value };
      await save();
    }
  }

  for (const resource of params.manifest.bindings.vectorize) {
    let value = state.vectorize?.[resource.binding];
    if (value?.name !== resource.name) {
      const existing = await findVectorize(params, resource.name);
      if (!existing && !params.allowCreate) throw new Error('Cloudflare resource creation requires confirmation');
      params.onProgress?.(`Cloudflare: ${existing ? 'Reusing' : 'Creating'} Vectorize ${resource.name}`);
      const index = existing ?? await cloudflareRequest<{ name: string }>(
        `/accounts/${encode(params.accountId)}/vectorize/v2/indexes`, params.token,
        { method: 'POST', body: JSON.stringify({ name: resource.name, description: resource.description, config: { dimensions: resource.dimensions, metric: resource.metric } }) }
      );
      value = { name: index.name };
      state.vectorize = { ...state.vectorize, [resource.binding]: value };
      await save();
    }
  }
  return state;
}

export function buildCloudflarePagesConfig(manifest: CloudflareManifest, state: CloudflareResourceState): CloudflarePagesConfig {
  const config: CloudflarePagesConfig = {};
  if (manifest.compatibilityDate) config.compatibility_date = manifest.compatibilityDate;
  if (manifest.compatibilityFlags) config.compatibility_flags = manifest.compatibilityFlags;

  const map = <T extends { binding: string }, V>(entries: T[], value: (entry: T) => V) =>
    Object.fromEntries(entries.map((entry) => [entry.binding, value(entry)]));

  if (manifest.bindings.d1.length) config.d1_databases = map(manifest.bindings.d1, (item) => {
    const id = state.d1?.[item.binding]?.id;
    if (!id) throw new Error(`D1 binding ${item.binding} is unresolved`);
    return { id };
  });
  if (manifest.bindings.kv.length) config.kv_namespaces = map(manifest.bindings.kv, (item) => {
    const id = state.kv?.[item.binding]?.id;
    if (!id) throw new Error(`KV binding ${item.binding} is unresolved`);
    return { namespace_id: id };
  });
  if (manifest.bindings.r2.length) config.r2_buckets = map(manifest.bindings.r2, (item) => ({ name: item.name, ...(item.jurisdiction && item.jurisdiction !== 'default' ? { jurisdiction: item.jurisdiction } : {}) }));
  if (manifest.bindings.queues.length) config.queue_producers = map(manifest.bindings.queues, (item) => ({ name: item.name }));
  if (manifest.bindings.vectorize.length) config.vectorize_bindings = map(manifest.bindings.vectorize, (item) => ({ index_name: item.name }));
  if (manifest.bindings.analyticsEngine.length) config.analytics_engine_datasets = map(manifest.bindings.analyticsEngine, (item) => ({ dataset: item.dataset }));
  if (manifest.bindings.services.length) config.services = Object.fromEntries(manifest.bindings.services.map((item) => [item.binding, { service: item.service, environment: item.environment, ...(item.entrypoint ? { entrypoint: item.entrypoint } : {}) }]));
  if (manifest.bindings.durableObjects.length) config.durable_object_namespaces = Object.fromEntries(manifest.bindings.durableObjects.map((item) => [item.binding, { namespace_id: item.namespaceId }]));
  if (manifest.bindings.ai.length) config.ai_bindings = Object.fromEntries(manifest.bindings.ai.map((item) => [item.binding, { project_id: item.projectId }]));
  if (manifest.bindings.browser.length) config.browsers = Object.fromEntries(manifest.bindings.browser.map((item) => [item.binding, {}]));
  return config;
}
