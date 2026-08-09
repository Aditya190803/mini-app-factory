import 'server-only';

import { cloudflareRequest, type CloudflareDeployFile } from '@/lib/cloudflare';
import type { CloudflareManifest, CloudflareResourceState } from '@/lib/cloudflare-manifest';

const encode = encodeURIComponent;

type WorkerBinding = Record<string, unknown> & { name: string; type: string };

export async function configureCloudflareWorkerSecrets(params: {
  token: string;
  accountId: string;
  workerNames: string[];
  secrets: Record<string, string | null>;
}) {
  if (Object.keys(params.secrets).length === 0) return;
  const secrets = Object.fromEntries(Object.entries(params.secrets).map(([name, text]) => [
    name,
    text === null ? null : { name, type: 'secret_text', text },
  ]));
  for (const workerName of params.workerNames) {
    await cloudflareRequest(
      `/accounts/${encode(params.accountId)}/workers/scripts/${encode(workerName)}/secrets-bulk`,
      params.token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({ secrets }),
      }
    );
  }
}

function buildWorkerBinding(binding: string, manifest: CloudflareManifest, state: CloudflareResourceState): WorkerBinding {
  const d1 = manifest.bindings.d1.find((item) => item.binding === binding);
  if (d1) return { name: binding, type: 'd1', database_id: state.d1?.[binding]?.id };
  const kv = manifest.bindings.kv.find((item) => item.binding === binding);
  if (kv) return { name: binding, type: 'kv_namespace', namespace_id: state.kv?.[binding]?.id };
  const r2 = manifest.bindings.r2.find((item) => item.binding === binding);
  if (r2) return { name: binding, type: 'r2_bucket', bucket_name: r2.name, ...(r2.jurisdiction && r2.jurisdiction !== 'default' ? { jurisdiction: r2.jurisdiction } : {}) };
  const queue = manifest.bindings.queues.find((item) => item.binding === binding);
  if (queue) return { name: binding, type: 'queue', queue_name: queue.name };
  const vectorize = manifest.bindings.vectorize.find((item) => item.binding === binding);
  if (vectorize) return { name: binding, type: 'vectorize', index_name: vectorize.name };
  const analytics = manifest.bindings.analyticsEngine.find((item) => item.binding === binding);
  if (analytics) return { name: binding, type: 'analytics_engine', dataset: analytics.dataset };
  const service = manifest.bindings.services.find((item) => item.binding === binding);
  if (service) return { name: binding, type: 'service', service: service.service, environment: service.environment, ...(service.entrypoint ? { entrypoint: service.entrypoint } : {}) };
  const durableObject = manifest.bindings.durableObjects.find((item) => item.binding === binding);
  if (durableObject) return { name: binding, type: 'durable_object_namespace', namespace_id: durableObject.namespaceId };
  if (manifest.bindings.ai.some((item) => item.binding === binding)) return { name: binding, type: 'ai' };
  if (manifest.bindings.browser.some((item) => item.binding === binding)) return { name: binding, type: 'browser' };
  throw new Error(`Worker binding ${binding} is unresolved`);
}

function requireResolvedBindings(bindings: WorkerBinding[]) {
  for (const binding of bindings) {
    if (binding.type === 'd1' && !binding.database_id) throw new Error(`D1 binding ${binding.name} is unresolved`);
    if (binding.type === 'kv_namespace' && !binding.namespace_id) throw new Error(`KV binding ${binding.name} is unresolved`);
  }
}

export async function deployCloudflareWorkers(params: {
  token: string;
  accountId: string;
  manifest: CloudflareManifest;
  state: CloudflareResourceState;
  files: CloudflareDeployFile[];
  secrets: Record<string, string>;
  allowCreate: boolean;
  onStateChange: (state: CloudflareResourceState) => Promise<void>;
  onProgress?: (message: string) => void;
}) {
  const state = structuredClone(params.state);

  for (const worker of params.manifest.workers) {
    const previous = state.worker?.[worker.name];
    const previousClasses = previous?.classes ?? [];
    const newObjects = worker.durableObjects.filter((item) => !previousClasses.includes(item.className));
    if ((!previous || newObjects.some((item) => !state.durableObject?.[item.binding])) && !params.allowCreate) {
      throw new Error('Cloudflare resource creation requires confirmation');
    }

    const source = params.files.find((file) => file.path.replace(/^\/+/, '') === worker.source);
    if (!source) throw new Error(`Worker source not found: ${worker.source}`);
    const bindings = worker.bindings.map((item) => buildWorkerBinding(item, params.manifest, state));
    bindings.push(...worker.durableObjects.map((item) => ({
      name: item.binding,
      type: 'durable_object_namespace',
      class_name: item.className,
    })));
    requireResolvedBindings(bindings);

    const nextTag = newObjects.length > 0 ? `v${previousClasses.length + newObjects.length}` : previous?.migrationTag;
    const metadata: Record<string, unknown> = {
      main_module: 'worker.js',
      bindings,
      keep_bindings: ['secret_text'],
      compatibility_date: worker.compatibilityDate ?? params.manifest.compatibilityDate,
      compatibility_flags: worker.compatibilityFlags ?? params.manifest.compatibilityFlags,
      observability: { enabled: worker.observability },
    };
    if (newObjects.length > 0) {
      metadata.migrations = {
        ...(previous?.migrationTag ? { old_tag: previous.migrationTag } : {}),
        new_tag: nextTag,
        new_classes: newObjects.filter((item) => !item.sqlite).map((item) => item.className),
        new_sqlite_classes: newObjects.filter((item) => item.sqlite).map((item) => item.className),
      };
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
    form.append('worker.js', new Blob([source.content], { type: 'application/javascript+module' }), 'worker.js');
    params.onProgress?.(`Cloudflare: Deploying Worker ${worker.name}`);
    await cloudflareRequest(
      `/accounts/${encode(params.accountId)}/workers/scripts/${encode(worker.name)}`,
      params.token,
      { method: 'PUT', body: form }
    );

    await cloudflareRequest(
      `/accounts/${encode(params.accountId)}/workers/scripts/${encode(worker.name)}/schedules`,
      params.token,
      { method: 'PUT', body: JSON.stringify(worker.crons.map((cron) => ({ cron }))) }
    );

    await configureCloudflareWorkerSecrets({
      token: params.token,
      accountId: params.accountId,
      workerNames: [worker.name],
      secrets: params.secrets,
    });

    for (const consumer of worker.queueConsumers) {
      const queue = state.queue?.[consumer.queue];
      if (!queue) throw new Error(`Queue binding ${consumer.queue} is unresolved`);
      const consumers = await cloudflareRequest<Array<{ consumer_id: string; script_name?: string }>>(
        `/accounts/${encode(params.accountId)}/queues/${encode(queue.id)}/consumers`, params.token
      );
      const existing = consumers.find((item) => item.script_name === worker.name);
      const body = {
        type: 'worker',
        script_name: worker.name,
        ...(consumer.deadLetterQueue ? { dead_letter_queue: consumer.deadLetterQueue } : {}),
        settings: {
          ...(consumer.batchSize ? { batch_size: consumer.batchSize } : {}),
          ...(consumer.maxConcurrency ? { max_concurrency: consumer.maxConcurrency } : {}),
          ...(consumer.maxRetries !== undefined ? { max_retries: consumer.maxRetries } : {}),
          ...(consumer.maxWaitTimeMs !== undefined ? { max_wait_time_ms: consumer.maxWaitTimeMs } : {}),
        },
      };
      await cloudflareRequest(
        `/accounts/${encode(params.accountId)}/queues/${encode(queue.id)}/consumers${existing ? `/${encode(existing.consumer_id)}` : ''}`,
        params.token,
        { method: existing ? 'PUT' : 'POST', body: JSON.stringify(body) }
      );
    }

    state.worker = {
      ...state.worker,
      [worker.name]: {
        name: worker.name,
        source: worker.source,
        ...(nextTag ? { migrationTag: nextTag } : {}),
        classes: [...new Set([...previousClasses, ...worker.durableObjects.map((item) => item.className)])],
      },
    };

    if (worker.durableObjects.length > 0) {
      const namespaces = await cloudflareRequest<Array<{ id: string; class: string; name: string; script: string }>>(
        `/accounts/${encode(params.accountId)}/workers/durable_objects/namespaces?per_page=1000`, params.token
      );
      for (const durableObject of worker.durableObjects) {
        const namespace = namespaces.find((item) => item.script === worker.name && item.class === durableObject.className);
        if (!namespace) throw new Error(`Durable Object namespace not found for ${worker.name}.${durableObject.className}`);
        state.durableObject = {
          ...state.durableObject,
          [durableObject.binding]: {
            id: namespace.id,
            name: namespace.name,
            worker: worker.name,
            className: durableObject.className,
          },
        };
      }
    }
    await params.onStateChange(state);
  }

  return state;
}
