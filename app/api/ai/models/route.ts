import { NextResponse } from 'next/server';
import { DEFAULT_MODEL_OPTIONS, type AIProviderId } from '@/lib/ai-admin-config';
import { stackServerApp } from '@/stack/server';
import { getPersistedAISettings, getGlobalAdminModelConfig } from '@/lib/ai-settings-store';

export const dynamic = 'force-dynamic';

type ModelEntry = {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  providerId: AIProviderId;
  hasVision?: boolean;
};

type ProviderMeta = {
  id: AIProviderId;
  name: string;
};

const PROVIDERS: ProviderMeta[] = [
  { id: 'google', name: 'Google Gemini' },
  { id: 'groq', name: 'Groq' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'cerebras', name: 'Cerebras' },
];

function addModel(
  models: ModelEntry[],
  seen: Set<string>,
  provider: ProviderMeta,
  modelId: string,
  name?: string,
) {
  const trimmed = modelId.trim();
  if (!trimmed) return;

  const key = `${provider.id}:${trimmed}`;
  if (seen.has(key)) return;
  seen.add(key);

  const label = (name || trimmed).trim() || trimmed;
  const lowered = trimmed.toLowerCase();
  const hasVision = lowered.includes('vision') || lowered.includes('gemini') || lowered.includes('vl');

  models.push({
    id: trimmed,
    name: label,
    fullName: `${label} (${provider.name})`,
    provider: provider.name,
    providerId: provider.id,
    hasVision,
  });
}

function canExposeModel(modelId: string, defaultModel: string, visibleModels: string[]) {
  if (modelId === defaultModel) return true;
  if (!visibleModels || visibleModels.length === 0) return true;
  return visibleModels.includes(modelId);
}

/**
 * Returns admin-selected models from Convex only (no live provider API calls).
 * Live catalog discovery is reserved for /api/admin/models.
 */
export async function GET(_request: Request) {
  const user = await stackServerApp.getUser();

  // Read global admin model config from Convex (fast, single DB read)
  const adminConfig = await getGlobalAdminModelConfig();

  const models: ModelEntry[] = [];
  const seen = new Set<string>();

  for (const provider of PROVIDERS) {
    const providerAdmin = adminConfig.providers[provider.id];
    if (!providerAdmin?.enabled) continue;

    // Add the default model (always visible)
    addModel(models, seen, provider, providerAdmin.defaultModel);

    // Add built-in defaults that pass the admin visibility filter
    DEFAULT_MODEL_OPTIONS[provider.id]
      .filter((modelId) => canExposeModel(modelId, providerAdmin.defaultModel, providerAdmin.visibleModels))
      .forEach((modelId) => addModel(models, seen, provider, modelId));

    // Add admin-configured custom models that pass the visibility filter
    providerAdmin.customModels
      .filter((modelId) => canExposeModel(modelId, providerAdmin.defaultModel, providerAdmin.visibleModels))
      .forEach((modelId) => addModel(models, seen, provider, modelId));

    // Add any models explicitly in the visibleModels list
    providerAdmin.visibleModels
      .forEach((modelId) => addModel(models, seen, provider, modelId));
  }

  // Merge user custom models from Convex
  if (user) {
    const persisted = await getPersistedAISettings(user.id);
    const customModels = persisted.customModels;
    if (customModels && typeof customModels === 'object') {
      for (const [providerIdStr, providerModels] of Object.entries(customModels)) {
        if (!Array.isArray(providerModels)) continue;
        const provider = PROVIDERS.find((p) => p.id === providerIdStr);
        if (!provider) continue;
        providerModels.forEach((modelId) => {
          if (typeof modelId === 'string') {
            addModel(models, seen, provider, modelId);
          }
        });
      }
    }
  }

  // Sort by provider order then name
  const orderMap = new Map(adminConfig.providerOrder.map((id, i) => [id, i]));
  models.sort((a, b) => {
    const orderDiff = (orderMap.get(a.providerId) ?? 99) - (orderMap.get(b.providerId) ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(
    { models },
    {
      headers: {
        // Allow short browser caching — models change rarely
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    },
  );
}
