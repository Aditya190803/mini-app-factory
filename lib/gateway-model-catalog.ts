export type GatewayCatalogModel = {
  id: string;
  name: string;
};

export const GATEWAY_DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Effort / routing suffixes the gateway exposes as separate model ids. */
const EFFORT_SUFFIX =
  /-(extra-low|low|medium|high|tiered|thinking|agent)$/i;

const EFFORT_RANK: Record<string, number> = {
  medium: 100,
  high: 90,
  '': 80,
  thinking: 70,
  low: 40,
  'extra-low': 20,
  tiered: 10,
  agent: 5,
};

export function prettifyGatewayModelName(id: string): string {
  const base = id.replace(EFFORT_SUFFIX, '');
  return base
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function effortKey(id: string): string {
  const match = id.match(EFFORT_SUFFIX);
  return match ? match[1].toLowerCase() : '';
}

export function gatewayModelFamily(id: string): string {
  return id.replace(EFFORT_SUFFIX, '');
}

function shouldSkipModel(id: string): boolean {
  if (id.startsWith('tab_')) return true;
  if (id.startsWith('chat_')) return true;
  if (id.includes('image')) return true;
  return false;
}

/**
 * Collapse effort variants (gemini-3.6-flash-low/medium/high) into one picker
 * entry so the catalog is usable. Prefer medium, then high, then bare id.
 */
export function collapseGatewayEffortModels(models: GatewayCatalogModel[]): GatewayCatalogModel[] {
  const best = new Map<string, { model: GatewayCatalogModel; rank: number }>();

  for (const model of models) {
    if (shouldSkipModel(model.id)) continue;
    const family = gatewayModelFamily(model.id);
    const rank = EFFORT_RANK[effortKey(model.id)] ?? 50;
    const current = best.get(family);
    if (!current || rank > current.rank) {
      best.set(family, {
        model: { id: model.id, name: prettifyGatewayModelName(model.id) },
        rank,
      });
    }
  }

  return Array.from(best.values())
    .map((entry) => entry.model)
    .sort((a, b) => a.name.localeCompare(b.name));
}
