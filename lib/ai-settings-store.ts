import 'server-only';

import { api } from '@/convex/_generated/api';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
import { getAuthedConvexClient } from '@/lib/convex-server';
import {
  DEFAULT_AI_ADMIN_CONFIG,
  type AIAdminConfig,
  type ProviderBYOKConfig,
  type ProviderCustomModelsConfig,
  sanitizeAIAdminConfig,
  sanitizeBYOKConfig,
  sanitizeCustomModelsConfig,
} from '@/lib/ai-admin-config';

/**
 * Every call here carries the caller's Stack Auth identity — Convex derives `userId` from the
 * token rather than from an argument, so a shared unauthenticated client no longer works.
 */
const getConvexClient = getAuthedConvexClient;

type StoredAISettingsRow = {
  adminConfigJson?: string;
  byokConfigJson?: string;
  customModelsJson?: string;
};

export type PersistedAISettings = {
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
  byokUnreadable: boolean;
  customModels: ProviderCustomModelsConfig;
};

function safeParse<T>(json: string | undefined | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// --- Per-user settings (BYOK keys, custom models, legacy admin config) ---

export async function getPersistedAISettings(): Promise<PersistedAISettings> {
  const convex = await getConvexClient();
  const row = await convex.query(api.aiSettings.getForCurrentUser, {}) as StoredAISettingsRow | null;

  if (!row) {
    return {
      adminConfig: DEFAULT_AI_ADMIN_CONFIG,
      byokConfig: {},
      byokUnreadable: false,
      customModels: {},
    };
  }

  const decryptedByok = row.byokConfigJson ? decryptSecret(row.byokConfigJson) : null;

  return {
    adminConfig: sanitizeAIAdminConfig(safeParse(row.adminConfigJson, DEFAULT_AI_ADMIN_CONFIG)),
    // Rows written before encryption are returned as-is by decryptSecret and re-encrypted on save.
    byokConfig: sanitizeBYOKConfig(safeParse(decryptedByok ?? undefined, {})),
    byokUnreadable: Boolean(row.byokConfigJson) && decryptedByok === null,
    customModels: sanitizeCustomModelsConfig(safeParse(row.customModelsJson, {})),
  };
}

/** Writes to the caller's own row — the owner is derived from the token inside Convex. */
export async function savePersistedAISettings(params: {
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
  customModels?: ProviderCustomModelsConfig;
}) {
  const convex = await getConvexClient();
  await convex.mutation(api.aiSettings.upsertForUser, {
    adminConfigJson: JSON.stringify(sanitizeAIAdminConfig(params.adminConfig)),
    byokConfigJson: encryptSecret(JSON.stringify(sanitizeBYOKConfig(params.byokConfig))),
    customModelsJson: params.customModels ? JSON.stringify(sanitizeCustomModelsConfig(params.customModels)) : undefined,
  });
}

// --- Global admin model config (singleton) ---

export async function getGlobalAdminModelConfig(): Promise<AIAdminConfig> {
  const convex = await getConvexClient();
  const row = await convex.query(api.aiSettings.getAdminModelConfig, {}) as { configJson?: string } | null;
  if (!row?.configJson) {
    return DEFAULT_AI_ADMIN_CONFIG;
  }
  return sanitizeAIAdminConfig(safeParse(row.configJson, DEFAULT_AI_ADMIN_CONFIG));
}

export async function saveGlobalAdminModelConfig(params: {
  config: AIAdminConfig;
  updatedBy?: string;
}) {
  const convex = await getConvexClient();
  await convex.mutation(api.aiSettings.upsertAdminModelConfig, {
    configJson: JSON.stringify(sanitizeAIAdminConfig(params.config)),
  });
}

// --- User custom models ---

export async function saveUserCustomModels(params: {
  customModels: ProviderCustomModelsConfig;
}) {
  const convex = await getConvexClient();
  await convex.mutation(api.aiSettings.updateUserCustomModels, {
    customModelsJson: JSON.stringify(sanitizeCustomModelsConfig(params.customModels)),
  });
}

export async function getUserCustomModels(): Promise<ProviderCustomModelsConfig> {
  const convex = await getConvexClient();
  const row = await convex.query(api.aiSettings.getForCurrentUser, {}) as StoredAISettingsRow | null;
  return sanitizeCustomModelsConfig(safeParse(row?.customModelsJson, {}));
}

// --- Admin audit ---

/** Actor identity is taken from the token inside Convex, not from these params. */
export async function addAIAdminAudit(params: {
  action: string;
  details: unknown;
}) {
  const convex = await getConvexClient();
  await convex.mutation(api.aiSettings.addAdminAudit, {
    action: params.action,
    detailsJson: JSON.stringify(params.details ?? {}),
  });
}

export type AIAdminAuditEntry = {
  _id: string;
  userId: string;
  email: string;
  action: string;
  detailsJson: string;
  createdAt: number;
};

/** Global audit log across all admins (admin-only, enforced in Convex). */
export async function listAIAdminAudit(params: {
  limit?: number;
}): Promise<AIAdminAuditEntry[]> {
  const convex = await getConvexClient();
  const rows = await convex.query(api.aiSettings.listAdminAudit, {
    limit: params.limit,
  });

  return (Array.isArray(rows) ? rows : []) as AIAdminAuditEntry[];
}
