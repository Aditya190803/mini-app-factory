import 'server-only';

export type OpenRouterCatalogModel = {
  id: string;
  name: string;
};

type CatalogResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    architecture?: { modality?: string };
  }>;
};

const CATALOG_ENDPOINT = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

export const OPENROUTER_AUTO_ROUTER_ID = 'openrouter/free';

let cache: { at: number; models: OpenRouterCatalogModel[] } | null = null;
let inflight: Promise<OpenRouterCatalogModel[]> | null = null;

function supportsTextOutput(modality: string | undefined): boolean {
  if (!modality) return true;
  const outputs = modality.split('->').pop() ?? '';
  return outputs.includes('text');
}

function isFreeModelId(id: string): boolean {
  return id === OPENROUTER_AUTO_ROUTER_ID || id.endsWith(':free');
}

async function loadCatalog(): Promise<OpenRouterCatalogModel[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(CATALOG_ENDPOINT, {
      headers: {
        Accept: 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Mini App Factory',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json()) as CatalogResponse;
    const data = Array.isArray(json.data) ? json.data : [];
    const models: OpenRouterCatalogModel[] = [];
    const seen = new Set<string>();
    for (const entry of data) {
      const id = (entry.id || '').trim();
      if (!id || seen.has(id)) continue;
      if (!isFreeModelId(id)) continue;
      if (!supportsTextOutput(entry.architecture?.modality)) continue;
      seen.add(id);
      const name = (entry.name || '').trim();
      models.push({ id, name: name || id });
    }
    models.sort((a, b) => a.name.localeCompare(b.name));
    return models;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOpenRouterFreeModels(): Promise<OpenRouterCatalogModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  if (!inflight) {
    inflight = loadCatalog().then((models) => {
      if (models.length > 0) cache = { at: Date.now(), models };
      inflight = null;
      return models;
    });
  }
  return inflight;
}

export async function resolveOpenRouterModel(
  modelId: string | null | undefined,
  fallback: string = OPENROUTER_AUTO_ROUTER_ID,
): Promise<string> {
  const trimmed = (modelId || '').trim();
  if (!trimmed) return fallback;
  if (trimmed === OPENROUTER_AUTO_ROUTER_ID) return trimmed;
  const catalog = await fetchOpenRouterFreeModels();
  if (catalog.length === 0) return trimmed;
  return catalog.some((model) => model.id === trimmed) ? trimmed : fallback;
}
