import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { isAdminUser } from '@/lib/admin-access';
import { isAllowedProviderModel, type AIProviderId } from '@/lib/ai-admin-config';
import { fetchOpenRouterFreeModels } from '@/lib/openrouter-models';
import { fetchOpenCodeFreeModels } from '@/lib/opencode-models';
import { getGlobalAdminModelConfig } from '@/lib/ai-settings-store';

export const dynamic = 'force-dynamic';

type ProviderConfig = {
  id: AIProviderId;
  name: string;
};

const PROVIDERS: ProviderConfig[] = [
  { id: 'opencode', name: 'OpenCode Zen' },
  { id: 'openrouter', name: 'OpenRouter' },
];

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
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminConfig = await getGlobalAdminModelConfig();

  const providers = await Promise.all(
    adminConfig.providerOrder.map(async (providerId) => {
      const provider = PROVIDERS.find((entry) => entry.id === providerId);
      if (!provider) return null;

      const providerConfig = adminConfig.providers[providerId];
      const modelMap = new Map<string, { id: string; name: string; isDefault: boolean; isCustom: boolean }>();

      addModel(modelMap, providerConfig.defaultModel, { isDefault: true });
      providerConfig.customModels.forEach((modelId) => addModel(modelMap, modelId, { isCustom: true }));
      providerConfig.visibleModels.forEach((modelId) => addModel(modelMap, modelId));

      const discovered = providerId === 'openrouter'
        ? await fetchOpenRouterFreeModels().catch(() => [])
        : await fetchOpenCodeFreeModels().catch(() => []);
      discovered.forEach((model) => {
        if (isAllowedProviderModel(providerId, model.id)) {
          addModel(modelMap, model.id, { name: model.name });
        }
      });

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
