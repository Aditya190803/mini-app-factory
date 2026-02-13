import {
  AI_ADMIN_CONFIG_STORAGE_KEY,
  AI_BYOK_STORAGE_KEY,
  AI_USER_CUSTOM_MODELS_STORAGE_KEY,
  DEFAULT_AI_ADMIN_CONFIG,
  type AIAdminConfig,
  type ProviderBYOKConfig,
  type ProviderCustomModelsConfig,
  fromBase64JSON,
  sanitizeAIAdminConfig,
  sanitizeBYOKConfig,
  sanitizeCustomModelsConfig,
  toBase64JSON,
} from '@/lib/ai-admin-config';

const isBrowser = () => typeof window !== 'undefined';

export function getStoredAIAdminConfig(): AIAdminConfig {
  if (!isBrowser()) return DEFAULT_AI_ADMIN_CONFIG;
  const raw = window.localStorage.getItem(AI_ADMIN_CONFIG_STORAGE_KEY);
  if (!raw) return DEFAULT_AI_ADMIN_CONFIG;

  try {
    const parsed = JSON.parse(raw);
    return sanitizeAIAdminConfig(parsed);
  } catch {
    return DEFAULT_AI_ADMIN_CONFIG;
  }
}

export function setStoredAIAdminConfig(config: AIAdminConfig): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(AI_ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(sanitizeAIAdminConfig(config)));
}

export function getStoredBYOKConfig(): ProviderBYOKConfig {
  if (!isBrowser()) return {};
  const raw = window.localStorage.getItem(AI_BYOK_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return sanitizeBYOKConfig(parsed);
  } catch {
    return {};
  }
}

export function setStoredBYOKConfig(config: ProviderBYOKConfig): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(AI_BYOK_STORAGE_KEY, JSON.stringify(sanitizeBYOKConfig(config)));
}

export function getStoredCustomModelsConfig(): ProviderCustomModelsConfig {
  if (!isBrowser()) return {};
  const raw = window.localStorage.getItem(AI_USER_CUSTOM_MODELS_STORAGE_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return sanitizeCustomModelsConfig(parsed);
  } catch {
    return {};
  }
}

export function setStoredCustomModelsConfig(config: ProviderCustomModelsConfig): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(AI_USER_CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(sanitizeCustomModelsConfig(config)));
}

export function withAIAdminHeaders(initial?: HeadersInit): HeadersInit {
  const headers = new Headers(initial || {});

  if (!isBrowser()) return headers;

  const config = getStoredAIAdminConfig();
  const byok = getStoredBYOKConfig();

  headers.set('x-maf-ai-config', toBase64JSON(config));
  if (Object.keys(byok).length > 0) {
    headers.set('x-maf-ai-byok', toBase64JSON(byok));
  }

  return headers;
}

export function decodeAIAdminHeader(encoded: string | null): AIAdminConfig {
  const parsed = fromBase64JSON<unknown>(encoded);
  return sanitizeAIAdminConfig(parsed);
}
