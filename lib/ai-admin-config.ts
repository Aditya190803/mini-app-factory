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

export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export const AI_ADMIN_CONFIG_STORAGE_KEY = 'mini_app_factory_ai_admin_config_v1';
export const AI_BYOK_STORAGE_KEY = 'mini_app_factory_ai_byok_v1';
export const AI_USER_CUSTOM_MODELS_STORAGE_KEY = 'mini_app_factory_user_custom_models_v1';

export const DEFAULT_PROVIDER_MODELS: Record<AIProviderId, string> = {
  opencode: 'deepseek-v4-flash-free',
  openrouter: 'openai/gpt-oss-120b',
};

export const DEFAULT_MODEL_OPTIONS: Record<AIProviderId, string[]> = {
  opencode: [...OPENCODE_FREE_MODELS],
  openrouter: ['openai/gpt-oss-120b', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
};

export function isAllowedProviderModel(providerId: AIProviderId, modelId: string): boolean {
  return providerId !== 'opencode' || (OPENCODE_FREE_MODELS as readonly string[]).includes(modelId);
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
