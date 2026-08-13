import 'server-only';

import { blake3 } from '@noble/hashes/blake3';
import { normalizeCloudflareProjectName } from '@/lib/deploy-shared';

export { normalizeCloudflareProjectName };

const API_BASE = 'https://api.cloudflare.com/client/v4';
const MAX_ASSET_COUNT = 20_000;
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const MAX_UPLOAD_BATCH_SIZE = 40 * 1024 * 1024;
const MAX_UPLOAD_BATCH_FILES = 2_000;

export type CloudflareAccount = { id: string; name: string };
export type CloudflareDeployFile = { path: string; content: string };
export type CloudflareDeployment = {
  id: string;
  url?: string;
  aliases?: string[];
  project_name?: string;
  environment?: string;
};

type CloudflareEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
};

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Array<{ code?: number; message?: string }> = []
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

export async function cloudflareRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
  if (!response.ok || !payload?.success) {
    const errors = payload?.errors ?? [];
    const detail = errors.map((error) => error.message).filter(Boolean).join('; ');
    throw new CloudflareApiError(
      `Cloudflare API error: ${response.status}${detail ? ` ${detail}` : ''}`,
      response.status,
      errors
    );
  }
  return payload.result;
}

export async function verifyCloudflareToken(token: string) {
  return cloudflareRequest<{ id: string; status: string }>('/user/tokens/verify', token);
}

export async function listCloudflareAccounts(token: string): Promise<CloudflareAccount[]> {
  return cloudflareRequest<CloudflareAccount[]>('/accounts?per_page=50', token);
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryCloudflare<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof CloudflareApiError && (error.status === 429 || error.status >= 500);
      if (!retryable || attempt === attempts - 1) throw error;
      await wait(2 ** attempt * 500);
    }
  }
  throw lastError;
}

export async function ensureCloudflarePagesProject(params: {
  token: string;
  accountId: string;
  projectName: string;
}) {
  const path = `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}`;
  try {
    return await cloudflareRequest<{ name: string; subdomain?: string }>(path, params.token);
  } catch (error) {
    if (!(error instanceof CloudflareApiError) || error.status !== 404) throw error;
  }

  return cloudflareRequest<{ name: string; subdomain?: string }>(
    `/accounts/${encode(params.accountId)}/pages/projects`,
    params.token,
    {
      method: 'POST',
      body: JSON.stringify({ name: params.projectName, production_branch: 'main' }),
    }
  );
}

function extension(path: string) {
  const fileName = path.split('/').pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function normalizeAssetPath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '..')) {
    throw new Error(`Invalid deployment path: ${path}`);
  }
  return normalized;
}

export function hashCloudflareAsset(path: string, content: string) {
  const base64 = Buffer.from(content, 'utf8').toString('base64');
  return Buffer.from(blake3(Buffer.from(base64 + extension(path), 'utf8'))).toString('hex').slice(0, 32);
}

function contentType(path: string) {
  switch (extension(path)) {
    case 'html': return 'text/html; charset=utf-8';
    case 'css': return 'text/css; charset=utf-8';
    case 'js':
    case 'mjs': return 'application/javascript; charset=utf-8';
    case 'json': return 'application/json; charset=utf-8';
    case 'svg': return 'image/svg+xml';
    case 'txt': return 'text/plain; charset=utf-8';
    case 'xml': return 'application/xml; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

type UploadAsset = {
  path: string;
  content: string;
  hash: string;
  size: number;
  contentType: string;
};

const SPECIAL_FILES = new Set(['_worker.js', '_headers', '_redirects', '_routes.json']);

export function prepareCloudflareAssets(files: CloudflareDeployFile[]) {
  const assets: UploadAsset[] = [];
  const special = new Map<string, string>();

  for (const file of files) {
    const path = normalizeAssetPath(file.path);
    if (path.endsWith('.sql') || ['cloudflare.json', 'wrangler.jsonc', 'wrangler.json', 'package.json', 'tsconfig.json', 'README.md', '.dev.vars.example', '.gitignore'].includes(path) || path.startsWith('workers/') || path.startsWith('src/')) continue;
    if (path.endsWith('/.keep') || path === '.keep') continue;
    const size = Buffer.byteLength(file.content, 'utf8');
    if (SPECIAL_FILES.has(path)) {
      if (size > MAX_ASSET_SIZE) throw new Error(`${path} exceeds Cloudflare Pages' 25 MiB limit`);
      special.set(path, file.content);
      continue;
    }

    if (size > MAX_ASSET_SIZE) throw new Error(`${path} exceeds Cloudflare Pages' 25 MiB limit`);
    assets.push({
      path,
      content: file.content,
      hash: hashCloudflareAsset(path, file.content),
      size,
      contentType: contentType(path),
    });
  }

  if (assets.length > MAX_ASSET_COUNT) {
    throw new Error(`Project has ${assets.length} assets; Cloudflare Pages allows ${MAX_ASSET_COUNT}`);
  }
  return { assets, special };
}

function uploadBatches(assets: UploadAsset[]) {
  const batches: UploadAsset[][] = [];
  let current: UploadAsset[] = [];
  let currentSize = 0;

  for (const asset of assets) {
    if (
      current.length > 0 &&
      (current.length >= MAX_UPLOAD_BATCH_FILES || currentSize + asset.size > MAX_UPLOAD_BATCH_SIZE)
    ) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(asset);
    currentSize += asset.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function uploadAssets(params: {
  token: string;
  accountId: string;
  projectName: string;
  assets: UploadAsset[];
  onProgress?: (message: string) => void;
}) {
  const tokenPath = `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/upload-token`;
  const fetchUploadJwt = async () => (await cloudflareRequest<{ jwt: string }>(tokenPath, params.token)).jwt;
  let jwt = await fetchUploadJwt();
  const uploadRequest = async <T>(path: string, init: RequestInit): Promise<T> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await cloudflareRequest<T>(path, jwt, init);
      } catch (error) {
        if (error instanceof CloudflareApiError && error.status === 401) {
          jwt = await fetchUploadJwt();
          continue;
        }
        const retryable = error instanceof CloudflareApiError && (error.status === 429 || error.status >= 500);
        if (!retryable || attempt === 4) throw error;
        await wait(2 ** attempt * 500);
      }
    }
    throw new Error('Cloudflare asset upload retry limit reached');
  };
  const hashes = [...new Set(params.assets.map((asset) => asset.hash))];
  const missing = await uploadRequest<string[]>('/pages/assets/check-missing', {
    method: 'POST',
    body: JSON.stringify({ hashes }),
  });
  const missingSet = new Set(missing);
  const uniqueMissing = [...new Map(
    params.assets.filter((asset) => missingSet.has(asset.hash)).map((asset) => [asset.hash, asset])
  ).values()];
  const batches = uploadBatches(uniqueMissing);

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    params.onProgress?.(`Cloudflare: Uploading assets (${index + 1}/${batches.length})`);
    await uploadRequest('/pages/assets/upload', {
      method: 'POST',
      body: JSON.stringify(batch.map((asset) => ({
        key: asset.hash,
        value: Buffer.from(asset.content, 'utf8').toString('base64'),
        metadata: { contentType: asset.contentType },
        base64: true,
      }))),
    });
  }

  await uploadRequest('/pages/assets/upsert-hashes', {
    method: 'POST',
    body: JSON.stringify({ hashes }),
  }).catch(() => undefined);

  return Object.fromEntries(params.assets.map((asset) => [`/${asset.path}`, asset.hash]));
}

export async function deployCloudflarePages(params: {
  token: string;
  accountId: string;
  projectName: string;
  files: CloudflareDeployFile[];
  onProgress?: (message: string) => void;
}) {
  const { assets, special } = prepareCloudflareAssets(params.files);
  params.onProgress?.('Cloudflare: Checking uploaded assets');
  const manifest = await uploadAssets({ ...params, assets });
  const form = new FormData();
  form.append('manifest', JSON.stringify(manifest));
  form.append('branch', 'main');

  const appendFile = (name: string, type: string) => {
    const value = special.get(name);
    if (value !== undefined) form.append(name, new Blob([value], { type }), name);
  };
  appendFile('_worker.js', 'application/javascript+module');
  appendFile('_headers', 'text/plain');
  appendFile('_redirects', 'text/plain');
  appendFile('_routes.json', 'application/json');

  params.onProgress?.('Cloudflare: Creating deployment');
  return retryCloudflare(() => cloudflareRequest<CloudflareDeployment>(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/deployments`,
    params.token,
    { method: 'POST', body: form }
  ));
}

export async function configureCloudflarePagesProject(params: {
  token: string;
  accountId: string;
  projectName: string;
  d1DatabaseId?: string;
  bindings?: Record<string, unknown>;
  envVars?: Record<string, string | null>;
}) {
  const config: Record<string, unknown> = { ...params.bindings };
  if (params.d1DatabaseId) config.d1_databases = { DB: { id: params.d1DatabaseId } };
  if (params.envVars) {
    config.env_vars = Object.fromEntries(
      Object.entries(params.envVars).map(([name, value]) => [
        name,
        value === null ? null : { type: 'secret_text', value },
      ])
    );
  }
  if (Object.keys(config).length === 0) return;

  await cloudflareRequest(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}`,
    params.token,
    {
      method: 'PATCH',
      body: JSON.stringify({ deployment_configs: { production: config, preview: config } }),
    }
  );
}

export async function createCloudflareD1Database(params: {
  token: string;
  accountId: string;
  name: string;
}) {
  return cloudflareRequest<{ uuid: string; name: string }>(
    `/accounts/${encode(params.accountId)}/d1/database`,
    params.token,
    { method: 'POST', body: JSON.stringify({ name: params.name }) }
  );
}

type D1QueryResult = { results?: Array<Record<string, unknown>>; success: boolean; error?: string };

async function queryD1(params: {
  token: string;
  accountId: string;
  databaseId: string;
  sql: string;
}) {
  return cloudflareRequest<D1QueryResult[]>(
    `/accounts/${encode(params.accountId)}/d1/database/${encode(params.databaseId)}/query`,
    params.token,
    { method: 'POST', body: JSON.stringify({ sql: params.sql }) }
  );
}

export async function applyCloudflareD1Migrations(params: {
  token: string;
  accountId: string;
  databaseId: string;
  migrations: CloudflareDeployFile[];
  migrationDir?: string;
  onProgress?: (message: string) => void;
}) {
  await queryD1({
    ...params,
    sql: 'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
  });
  const existing = await queryD1({ ...params, sql: 'SELECT name FROM d1_migrations ORDER BY id;' });
  const applied = new Set(
    existing.flatMap((result) => result.results ?? []).map((row) => String(row.name))
  );
  const migrationPrefix = `${(params.migrationDir ?? 'migrations').replace(/\/+$/, '')}/`;
  const migrations = [...params.migrations]
    .map((migration) => ({ ...migration, path: normalizeAssetPath(migration.path) }))
    .filter((migration) => migration.path.startsWith(migrationPrefix) && migration.path.endsWith('.sql'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const migration of migrations) {
    if (applied.has(migration.path)) continue;
    params.onProgress?.(`Cloudflare: Applying ${migration.path}`);
    const escapedName = migration.path.replace(/'/g, "''");
    const result = await queryD1({
      ...params,
      sql: `${migration.content}\nINSERT INTO d1_migrations (name) VALUES ('${escapedName}');`,
    });
    if (result.some((entry) => !entry.success)) {
      throw new Error(`D1 migration failed: ${migration.path}`);
    }
  }
}

export async function addCloudflarePagesDomain(params: {
  token: string;
  accountId: string;
  projectName: string;
  domain: string;
}) {
  return cloudflareRequest<{ name: string; status?: string }>(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/domains`,
    params.token,
    { method: 'POST', body: JSON.stringify({ name: params.domain }) }
  );
}

export type CloudflareZone = { id: string; name: string; status: string; type: string };
export type CloudflarePagesDomain = { name: string; status?: string; verification_data?: { status?: string; error_message?: string } };

export async function listCloudflareZones(params: { token: string; accountId: string }) {
  return cloudflareRequest<CloudflareZone[]>(
    `/zones?account.id=${encode(params.accountId)}&status=active&per_page=50`,
    params.token
  );
}

export async function getCloudflarePagesDomain(params: { token: string; accountId: string; projectName: string; domain: string }) {
  return cloudflareRequest<CloudflarePagesDomain>(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/domains/${encode(params.domain)}`,
    params.token
  );
}

export async function removeCloudflarePagesDomain(params: { token: string; accountId: string; projectName: string; domain: string }) {
  await cloudflareRequest(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/domains/${encode(params.domain)}`,
    params.token,
    { method: 'DELETE' }
  );
}

export async function rollbackCloudflarePagesDeployment(params: {
  token: string;
  accountId: string;
  projectName: string;
  deploymentId: string;
}) {
  return cloudflareRequest<CloudflareDeployment>(
    `/accounts/${encode(params.accountId)}/pages/projects/${encode(params.projectName)}/deployments/${encode(params.deploymentId)}/rollback`,
    params.token,
    { method: 'POST' }
  );
}
