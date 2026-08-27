import {
  AI_ADMIN_CONFIG_STORAGE_KEY,
  AI_BYOK_STORAGE_KEY,
  AI_SELECTED_MODEL_STORAGE_KEY,
  AI_USER_CUSTOM_MODELS_STORAGE_KEY,
  DEFAULT_AI_ADMIN_CONFIG,
  type AIAdminConfig,
  type ProviderCustomModelsConfig,
  type StoredSelectedModel,
  resolveSelectedAIModel,
  sanitizeAIAdminConfig,
  sanitizeCustomModelsConfig,
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

/**
 * BYOK provider keys are no longer mirrored into localStorage — they live only in Convex and are
 * never returned to the browser. Storing them here made any script running on this origin
 * (including one in a generated site, before the /results sandbox landed) able to read every key
 * the user had configured.
 *
 * Existing installs still have keys sitting in localStorage from before that change, so purge
 * them once on load. Safe to remove this call after a release or two.
 */
export function purgeLegacyStoredBYOK(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(AI_BYOK_STORAGE_KEY);
  } catch {
    // Private-mode or storage-disabled browsers: nothing to purge.
  }
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

const EMPTY_SELECTED_MODEL: StoredSelectedModel = { id: '', providerId: '' };

export function getStoredSelectedModel(): StoredSelectedModel {
  if (!isBrowser()) return EMPTY_SELECTED_MODEL;
  const raw = window.localStorage.getItem(AI_SELECTED_MODEL_STORAGE_KEY);
  if (!raw) return EMPTY_SELECTED_MODEL;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; providerId?: unknown };
    const id = typeof parsed.id === 'string' ? parsed.id : '';
    const providerId = typeof parsed.providerId === 'string' ? parsed.providerId : '';
    const resolved = resolveSelectedAIModel(id, providerId);
    return resolved ? { id: resolved.model, providerId: resolved.providerId } : EMPTY_SELECTED_MODEL;
  } catch {
    return EMPTY_SELECTED_MODEL;
  }
}

export function setStoredSelectedModel(value: StoredSelectedModel): void {
  if (!isBrowser()) return;
  const resolved = resolveSelectedAIModel(value.id, value.providerId);
  if (!resolved) {
    window.localStorage.removeItem(AI_SELECTED_MODEL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    AI_SELECTED_MODEL_STORAGE_KEY,
    JSON.stringify({ id: resolved.model, providerId: resolved.providerId }),
  );
}

/**
 * Kept as a pass-through so call sites don't all have to change.
 *
 * This used to attach `x-maf-ai-config` and `x-maf-ai-byok` headers, the latter carrying
 * base64-encoded provider API keys. No server route has read either header since AI settings
 * moved into Convex — so the only thing it accomplished was transmitting live secrets on every
 * request, where any proxy or APM that captures headers would log them. Removed.
 */
export function withAIAdminHeaders(initial?: HeadersInit): HeadersInit {
  return new Headers(initial || {});
}
