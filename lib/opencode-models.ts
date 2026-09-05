import 'server-only';

import { isOpenCodeFreeModelId } from '@/lib/ai-admin-config';

export type OpenCodeCatalogModel = {
  id: string;
  name: string;
};

type CatalogResponse = {
  object?: string;
  data?: Array<{ id?: string }>;
};

const CATALOG_ENDPOINT = 'https://opencode.ai/zen/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

export const OPENCODE_DEFAULT_MODEL = 'deepseek-v4-flash-free';

function prettifyName(id: string): string {
  return id
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

let cache: { at: number; models: OpenCodeCatalogModel[] } | null = null;
let inflight: Promise<OpenCodeCatalogModel[]> | null = null;

async function loadCatalog(apiKey?: string): Promise<OpenCodeCatalogModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(CATALOG_ENDPOINT, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json()) as CatalogResponse;
    const data = Array.isArray(json.data) ? json.data : [];
    const models: OpenCodeCatalogModel[] = [];
    const seen = new Set<string>();
    for (const entry of data) {
      const id = (entry.id || '').trim();
      if (!id || seen.has(id)) continue;
      if (!isOpenCodeFreeModelId(id)) continue;
      seen.add(id);
      models.push({ id, name: prettifyName(id) });
    }
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenCodeFreeModels(apiKey?: string): Promise<OpenCodeCatalogModel[]> {
  if (!apiKey && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  if (!inflight) {
    inflight = loadCatalog(apiKey).then((models) => {
      if (!apiKey && models.length > 0) cache = { at: Date.now(), models };
      inflight = null;
      return models;
    });
  }
  return inflight;
}

export async function resolveOpenCodeModel(
  modelId: string | null | undefined,
  fallback: string = OPENCODE_DEFAULT_MODEL,
): Promise<string> {
  const trimmed = (modelId || '').trim();
  if (!trimmed) return fallback;
  const catalog = await fetchOpenCodeFreeModels();
  if (catalog.length === 0) return trimmed;
  if (catalog.some((model) => model.id === trimmed)) return trimmed;
  const liveFallback = catalog.some((model) => model.id === fallback) ? fallback : catalog[0].id;
  return liveFallback;
}
