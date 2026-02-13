export const AI_PROVIDER_IDS = ['google', 'groq', 'openrouter', 'cerebras'] as const;

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
  google: 'gemini-3-flash-preview',
  groq: 'moonshotai/kimi-k2-instruct-0905',
  openrouter: 'openai/gpt-oss-120b',
  cerebras: 'llama-3.3-70b',
};

export const DEFAULT_MODEL_OPTIONS: Record<AIProviderId, string[]> = {
  google: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemma-3-27b'],
  groq: ['moonshotai/kimi-k2-instruct-0905', 'qwen/qwen3-32b', 'llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
  openrouter: ['openai/gpt-oss-120b', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct'],
  cerebras: ['llama-3.3-70b', 'qwen-3-32b', 'llama3.1-8b'],
};

export const DEFAULT_AI_ADMIN_CONFIG: AIAdminConfig = {
  providers: {
    google: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.google, customModels: [], visibleModels: [] },
    groq: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.groq, customModels: [], visibleModels: [] },
    openrouter: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.openrouter, customModels: [], visibleModels: [] },
    cerebras: { enabled: true, defaultModel: DEFAULT_PROVIDER_MODELS.cerebras, customModels: [], visibleModels: [] },
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
    const defaultModel = typeof providerObj.defaultModel === 'string' && providerObj.defaultModel.trim().length > 0
      ? providerObj.defaultModel.trim()
      : fallback.defaultModel;

    // Handle migration: if we have visibleModels, use it. 
    // If not, but we have hiddenModels, we can't easily invert it here without the catalog,
    // so we'll just ignore old hiddenModels for now to avoid complexity in the sanitizer.
    // The UI or persistence layer can handle more complex migrations if needed.
    const visibleModels = normalizeModelList(providerObj.visibleModels || [], 10000);

    acc[providerId] = {
      enabled: typeof providerObj.enabled === 'boolean' ? providerObj.enabled : fallback.enabled,
      defaultModel,
      customModels: normalizeModelList(providerObj.customModels, 1000),
      visibleModels,
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
    const models = normalizeModelList(value, 200);
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
