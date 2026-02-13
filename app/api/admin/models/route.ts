import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { isAdminEmail } from '@/lib/admin-access';
import { DEFAULT_MODEL_OPTIONS, type AIProviderId } from '@/lib/ai-admin-config';
import { getPersistedAISettings, getGlobalAdminModelConfig } from '@/lib/ai-settings-store';

export const dynamic = 'force-dynamic';

type ProviderModel = {
  id: string;
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
};

type ProviderResponse = {
  data?: ProviderModel[];
  models?: ProviderModel[];
};

type ProviderConfig = {
  id: AIProviderId;
  name: string;
  endpoint?: string;
};

const PROVIDERS: ProviderConfig[] = [
  { id: 'google', name: 'Google Gemini' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/models' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/models' },
  { id: 'cerebras', name: 'Cerebras', endpoint: 'https://api.cerebras.ai/v1/models' },
];

const GOOGLE_MODELS_ENDPOINTS = [
  'https://generativelanguage.googleapis.com/v1beta/models',
  'https://generativelanguage.googleapis.com/v1/models',
] as const;

function getProviderApiKey(providerId: AIProviderId, byok: Partial<Record<AIProviderId, string>>) {
  if (providerId === 'google') return byok.google || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (providerId === 'groq') return byok.groq || process.env.GROQ_API_KEY;
  if (providerId === 'openrouter') return byok.openrouter || process.env.OPENROUTER_API_KEY;
  return byok.cerebras || process.env.CEREBRAS_API_KEY;
}

async function fetchProviderModels(provider: ProviderConfig, apiKey?: string): Promise<Array<{ id: string; name?: string }>> {
  if (provider.id === 'google') {
    if (!apiKey) return [];

    for (const endpoint of GOOGLE_MODELS_ENDPOINTS) {
      const url = `${endpoint}?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (!response.ok) continue;

      const json = (await response.json()) as ProviderResponse;
      const models = Array.isArray(json.models) ? json.models : [];

      return models
        .filter((model) => {
          const id = (model.name || model.id || '').replace(/^models\//, '');
          if (!id) return false;
          return id.startsWith('gemini') || id.startsWith('gemma');
        })
        .map((model) => {
          const id = (model.name || model.id || '').replace(/^models\//, '').trim();
          return {
            id,
            name: model.displayName || id,
          };
        });
    }

    return [];
  }
  if (!provider.endpoint) return [];

  const headers = new Headers({ Accept: 'application/json' });
  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  if (provider.id === 'openrouter') {
    headers.set('HTTP-Referer', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
    headers.set('X-Title', 'Mini App Factory');
  }

  const response = await fetch(provider.endpoint, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as ProviderResponse | ProviderModel[];
  if (Array.isArray(json)) {
    return json
      .map((model) => ({
        id: (model.id || model.name || '').replace(/^models\//, '').trim(),
        name: model.displayName || model.name,
      }))
      .filter((model) => model.id.length > 0);
  }
  if (Array.isArray(json.data)) {
    return json.data
      .map((model) => ({
        id: (model.id || model.name || '').replace(/^models\//, '').trim(),
        name: model.displayName || model.name,
      }))
      .filter((model) => model.id.length > 0);
  }
  if (Array.isArray(json.models)) {
    return json.models
      .map((model) => ({
        id: (model.id || model.name || '').replace(/^models\//, '').trim(),
        name: model.displayName || model.name,
      }))
      .filter((model) => model.id.length > 0);
  }
  return [];
}

function addModel(
  modelMap: Map<string, { id: string; name: string; isDefault: boolean; isCustom: boolean }>,
  modelId: string,
  options?: { name?: string; isDefault?: boolean; isCustom?: boolean }
) {
  const trimmed = modelId.trim();
  if (!trimmed) return;

  const existing = modelMap.get(trimmed);
  const nextName = (options?.name || trimmed).trim() || trimmed;

  if (!existing) {
    modelMap.set(trimmed, {
      id: trimmed,
      name: nextName,
      isDefault: !!options?.isDefault,
      isCustom: !!options?.isCustom,
    });
    return;
  }

  modelMap.set(trimmed, {
    ...existing,
    name: existing.name || nextName,
    isDefault: existing.isDefault || !!options?.isDefault,
    isCustom: existing.isCustom || !!options?.isCustom,
  });
}

export async function GET(_request: Request) {
  const user = await stackServerApp.getUser();
  if (!user || !isAdminEmail(user.primaryEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminConfig = await getGlobalAdminModelConfig();
  const persisted = await getPersistedAISettings(user.id);
  const byokConfig = persisted.byokConfig;

  const providers = await Promise.all(
    adminConfig.providerOrder.map(async (providerId) => {
      const provider = PROVIDERS.find((entry) => entry.id === providerId);
      if (!provider) return null;

      const providerConfig = adminConfig.providers[providerId];
      const modelMap = new Map<string, { id: string; name: string; isDefault: boolean; isCustom: boolean }>();

      DEFAULT_MODEL_OPTIONS[providerId].forEach((modelId) => addModel(modelMap, modelId));
      addModel(modelMap, providerConfig.defaultModel, { isDefault: true });
      providerConfig.customModels.forEach((modelId) => addModel(modelMap, modelId, { isCustom: true }));
      providerConfig.visibleModels.forEach((modelId) => addModel(modelMap, modelId));

      const apiKey = getProviderApiKey(providerId, byokConfig);
      if (apiKey || providerId === 'openrouter') {
        const discovered = await fetchProviderModels(provider, apiKey).catch(() => []);
        discovered.forEach((model) => addModel(modelMap, model.id, { name: model.name }));
      }

      const models = Array.from(modelMap.values())
        .map((model) => {
          const isDefault = providerConfig.defaultModel === model.id;
          const isHidden = providerConfig.visibleModels.length > 0 && !providerConfig.visibleModels.includes(model.id) && !isDefault;
          return {
            ...model,
            hidden: isHidden,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        providerId,
        providerName: provider.name,
        enabled: providerConfig.enabled,
        defaultModel: providerConfig.defaultModel,
        models,
      };
    })
  );

  return NextResponse.json({
    providerOrder: adminConfig.providerOrder,
    providers: providers.filter(Boolean),
  });
}
