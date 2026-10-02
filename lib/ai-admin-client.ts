import {
  AI_BYOK_STORAGE_KEY,
  AI_SELECTED_MODEL_STORAGE_KEY,
  type StoredSelectedModel,
  resolveSelectedAIModel,
} from '@/lib/ai-admin-config';

const isBrowser = () => typeof window !== 'undefined';

const LEGACY_ADMIN_CONFIG_KEY = 'mini_app_factory_ai_admin_config_v1';

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
    // The admin model config used to be mirrored here too; the server is the only source now.
    window.localStorage.removeItem(LEGACY_ADMIN_CONFIG_KEY);
  } catch {
    // Private-mode or storage-disabled browsers: nothing to purge.
  }
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
