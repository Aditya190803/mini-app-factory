export const AI_PROVIDER_IDS = ['opencode', 'openrouter'] as const;

export const OPENCODE_FREE_MODELS = [
  'big-pickle',
  'mimo-v2.5-free',
  'laguna-s-2.1-free',
  'ling-3.0-tiny-free',
  'longcat-2.0-free',
  'nemotron-3-ultra-free',
  'deepseek-v4-flash-free',
] as const;

export type OpenRouterFreeModelInfo = {
  id: string;
  name: string;
  note: string;
};

/** Shown in the model selector by default. */
export const OPENROUTER_FREE_MODELS = [
  'openrouter/free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'minimax/minimax-m2.7:free',
  'poolside/laguna-s-2.1:free',
  'google/gemma-4-31b-it:free',
] as const;

/**
 * Extra OpenRouter free models that can be added from Settings / Admin.
 * Kept out of the default selector so the list stays short.
 */
export const OPENROUTER_ADDABLE_FREE_MODELS: readonly OpenRouterFreeModelInfo[] = [
  { id: 'thinkingmachines/inkling:free', name: 'Inkling Free', note: 'Long-context multimodal coding model' },
  { id: 'thinkingmachines/inkling-small:free', name: 'Inkling Small Free', note: 'Faster Inkling variant' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super Free', note: '120B reasoning / coding' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', name: 'Nemotron 3 Nano Omni Free', note: 'Multimodal reasoning' },
  { id: 'minimax/minimax-m3:free', name: 'MiniMax M3 Free', note: '1M-context multimodal' },
  { id: 'poolside/laguna-xs-2.1:free', name: 'Laguna XS 2.1 Free', note: 'Smaller Poolside coding model' },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B Free', note: 'Mixture-of-experts Gemma' },
  { id: 'inclusionai/ling-3.0-flash-fin:free', name: 'Ling 3.0 Flash Free', note: 'Fast instruction model' },
  { id: 'dots-studio/dots-3-note-preview:free', name: 'Dots3-Note Preview Free', note: 'Long-context notes / docs' },
  { id: 'liquid/lfm-2.5-2.6b:free', name: 'LFM 2.5 2.6B Free', note: 'Tiny / low-latency fallback' },
];

export const OPENROUTER_FREE_MODEL_INFO: Record<string, { name: string; note: string }> = {
  'openrouter/free': { name: 'Free Models Router', note: 'Auto-picks a free model that matches the request' },
  'z-ai/glm-5.2:free': { name: 'GLM 5.2 Free', note: 'Strong general coding model' },
  'nvidia/nemotron-3.5-lightning:free': { name: 'Nemotron 3.5 Lightning Free', note: 'Fast NVIDIA coding model' },
  'nvidia/nemotron-3-ultra-550b-a55b:free': { name: 'Nemotron 3 Ultra Free', note: 'Largest NVIDIA free model' },
  'minimax/minimax-m2.7:free': { name: 'MiniMax M2.7 Free', note: 'Coding-focused MiniMax' },
  'poolside/laguna-s-2.1:free': { name: 'Laguna S 2.1 Free', note: 'Poolside coding model' },
  'google/gemma-4-31b-it:free': { name: 'Gemma 4 31B Free', note: 'Google instruction model' },
  ...Object.fromEntries(OPENROUTER_ADDABLE_FREE_MODELS.map((model) => [model.id, { name: model.name, note: model.note }])),
};

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

export type ProviderAdminConfig = {
  enabled: boolean;
  defaultModel: string;
  customModels: string[];
  visibleModels: string[];
};

export type AIAdminConfig = {
  providers: Record<AIProviderId, ProviderAdminConfig>;
  providerOrder: AIProviderId[];
};

export type ProviderBYOKConfig = Partial<Record<AIProviderId, string>>;
export type ProviderCustomModelsConfig = Partial<Record<AIProviderId, string[]>>;

export type ResolvedAIModel = {
  model: string;
  providerId: AIProviderId;
};

export type StoredSelectedModel = {
  id: string;
  providerId: string;
};

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export const AI_ADMIN_CONFIG_STORAGE_KEY = 'mini_app_factory_ai_admin_config_v1';
export const AI_BYOK_STORAGE_KEY = 'mini_app_factory_ai_byok_v1';
export const AI_USER_CUSTOM_MODELS_STORAGE_KEY = 'mini_app_factory_user_custom_models_v1';
export const AI_SELECTED_MODEL_STORAGE_KEY = 'mini_app_factory_selected_model_v1';

export const DEFAULT_PROVIDER_MODELS: Record<AIProviderId, string> = {
  opencode: 'deepseek-v4-flash-free',
  openrouter: 'openrouter/free',
};

export const DEFAULT_MODEL_OPTIONS: Record<AIProviderId, string[]> = {
  opencode: [...OPENCODE_FREE_MODELS],
  openrouter: [...OPENROUTER_FREE_MODELS],
};

export function isOpenRouterFreeModel(modelId: string): boolean {
  const trimmed = modelId.trim();
  if (!trimmed) return false;
  if (trimmed === 'openrouter/free') return true;
  return trimmed.endsWith(':free');
}

export function isAllowedProviderModel(providerId: AIProviderId, modelId: string): boolean {
  if (providerId === 'opencode') {
    return (OPENCODE_FREE_MODELS as readonly string[]).includes(modelId);
  }
  return isOpenRouterFreeModel(modelId);
}

export function resolveSelectedAIModel(
  model?: string | null,
  providerId?: string | null,
): ResolvedAIModel | undefined {
  if (!isAIProviderId(providerId)) return undefined;
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || !isAllowedProviderModel(providerId, trimmed)) return undefined;
  return { model: trimmed, providerId };
}

export function getProviderModelLabel(providerId: AIProviderId, modelId: string): string {
  if (providerId === 'openrouter') {
    return OPENROUTER_FREE_MODEL_INFO[modelId]?.name || modelId;
  }
  return modelId;
}

export function addableOpenRouterModels(alreadyHave: string[] = []): OpenRouterFreeModelInfo[] {
  const have = new Set(alreadyHave);
  return OPENROUTER_ADDABLE_FREE_MODELS.filter((model) => !have.has(model.id));
}

export const DEFAULT_AI_ADMIN_CONFIG: AIAdminConfig = {
  providers: {
    opencode: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.opencode, customModels: [], visibleModels: [] },
    openrouter: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.openrouter, customModels: [], visibleModels: [] },
  },
  providerOrder: [...AI_PROVIDER_IDS],
};

const normalizeModelList = (value: unknown, max = 500): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index)
    .slice(0, max);
};

export function sanitizeAIAdminConfig(input: unknown): AIAdminConfig {
  const raw = typeof input === 'object' && input !== null
    ? (input as { providers?: Record<string, unknown>; providerOrder?: unknown })
    : {};
  const providersRaw = raw.providers && typeof raw.providers === 'object' ? raw.providers : {};

  const providers = AI_PROVIDER_IDS.reduce((acc, providerId) => {
    const providerInput = providersRaw[providerId];
    const providerObj = typeof providerInput === 'object' && providerInput !== null
      ? (providerInput as { enabled?: unknown; defaultModel?: unknown; customModels?: unknown; visibleModels?: unknown; hiddenModels?: unknown })
      : {};

    const fallback = DEFAULT_AI_ADMIN_CONFIG.providers[providerId];
    const requestedDefault = typeof providerObj.defaultModel === 'string' && providerObj.defaultModel.trim().length > 0
      ? providerObj.defaultModel.trim()
      : fallback.defaultModel;
    const defaultModel = isAllowedProviderModel(providerId, requestedDefault)
      ? requestedDefault
      : fallback.defaultModel;
    const allowedModels = (value: unknown, max: number) => normalizeModelList(value, max)
      .filter((modelId) => isAllowedProviderModel(providerId, modelId));

    acc[providerId] = {
      enabled: typeof providerObj.enabled === 'boolean' ? providerObj.enabled : fallback.enabled,
      defaultModel,
      customModels: allowedModels(providerObj.customModels, 1000),
      visibleModels: allowedModels(providerObj.visibleModels, 10000),
    };
    return acc;
  }, {} as Record<AIProviderId, ProviderAdminConfig>);

  const requestedOrder = Array.isArray(raw.providerOrder)
    ? raw.providerOrder.filter((entry): entry is AIProviderId => isAIProviderId(entry))
    : [];
  const uniqueRequestedOrder = requestedOrder.filter((entry, index) => requestedOrder.indexOf(entry) === index);
  const missing = AI_PROVIDER_IDS.filter((providerId) => !uniqueRequestedOrder.includes(providerId));
  const providerOrder = [...uniqueRequestedOrder, ...missing];

  return { providers, providerOrder };
}

export function sanitizeBYOKConfig(input: unknown): ProviderBYOKConfig {
  if (typeof input !== 'object' || input === null) return {};
  const raw = input as Record<string, unknown>;
  const result: ProviderBYOKConfig = {};

  for (const providerId of AI_PROVIDER_IDS) {
    const value = raw[providerId];
    if (typeof value === 'string' && value.trim().length > 0) {
      result[providerId] = value.trim();
    }
  }

  return result;
}

export function sanitizeCustomModelsConfig(input: unknown): ProviderCustomModelsConfig {
  if (typeof input !== 'object' || input === null) return {};
  const raw = input as Record<string, unknown>;
  const result: ProviderCustomModelsConfig = {};

  for (const providerId of AI_PROVIDER_IDS) {
    const value = raw[providerId];
    const models = normalizeModelList(value, 200)
      .filter((modelId) => isAllowedProviderModel(providerId, modelId));
    if (models.length > 0) {
      result[providerId] = models;
    }
  }

  return result;
}

export function toBase64JSON(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, 'utf8').toString('base64');
}

export function fromBase64JSON<T>(encoded: string | null): T | null {
  if (!encoded) return null;
  try {
    const raw = typeof window !== 'undefined' && typeof window.atob === 'function'
      ? decodeURIComponent(escape(window.atob(encoded)))
      : Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
