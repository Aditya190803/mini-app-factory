import 'server-only';

export type GatewayCatalogModel = {
  id: string;
  name: string;
};

type CatalogResponse = {
  object?: string;
  data?: Array<{ id?: string }>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

export const GATEWAY_DEFAULT_MODEL = 'claude-sonnet-4-6';

export function getAiGatewayConfig() {
  const baseURL = (process.env.AI_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '');
  const apiKey = (process.env.AI_GATEWAY_API_KEY || '').trim();
  const defaultModel = (process.env.AI_GATEWAY_MODEL || GATEWAY_DEFAULT_MODEL).trim() || GATEWAY_DEFAULT_MODEL;
  return {
    baseURL,
    apiKey,
    defaultModel,
    configured: Boolean(baseURL && apiKey),
  };
}

function prettifyName(id: string): string {
  return id
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

let cache: { at: number; models: GatewayCatalogModel[] } | null = null;
let inflight: Promise<GatewayCatalogModel[]> | null = null;

async function loadCatalog(): Promise<GatewayCatalogModel[]> {
  const { baseURL, apiKey, configured } = getAiGatewayConfig();
  if (!configured) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseURL}/models`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json()) as CatalogResponse;
    const data = Array.isArray(json.data) ? json.data : [];
    const models: GatewayCatalogModel[] = [];
    const seen = new Set<string>();
    for (const entry of data) {
      const id = (entry.id || '').trim();
      if (!id || seen.has(id)) continue;
      // Tab-completion models are not useful as the factory's generation model.
      if (id.startsWith('tab_')) continue;
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

export async function fetchGatewayModels(): Promise<GatewayCatalogModel[]> {
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

export async function resolveGatewayModel(
  modelId: string | null | undefined,
  fallback: string = GATEWAY_DEFAULT_MODEL
): Promise<string> {
  const trimmed = (modelId || '').trim();
  const catalog = await fetchGatewayModels();
  if (!trimmed) {
    return catalog.some((model) => model.id === fallback) ? fallback : catalog[0]?.id || fallback;
  }
  if (catalog.length === 0) return trimmed;
  if (catalog.some((model) => model.id === trimmed)) return trimmed;
  return catalog.some((model) => model.id === fallback) ? fallback : catalog[0].id;
}
