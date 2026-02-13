import 'server-only';

import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import {
  DEFAULT_AI_ADMIN_CONFIG,
  type AIAdminConfig,
  type ProviderBYOKConfig,
  type ProviderCustomModelsConfig,
  sanitizeAIAdminConfig,
  sanitizeBYOKConfig,
  sanitizeCustomModelsConfig,
} from '@/lib/ai-admin-config';

let convexClient: ConvexHttpClient | null = null;

function getConvexClient() {
  if (convexClient) return convexClient;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  }
  convexClient = new ConvexHttpClient(url);
  return convexClient;
}

type StoredAISettingsRow = {
  adminConfigJson?: string;
  byokConfigJson?: string;
  customModelsJson?: string;
};

export type PersistedAISettings = {
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
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

export async function getPersistedAISettings(userId: string): Promise<PersistedAISettings> {
  const convex = getConvexClient();
  const row = await convex.query(api.aiSettings.getByUserId, { userId }) as StoredAISettingsRow | null;

  if (!row) {
    return {
      adminConfig: DEFAULT_AI_ADMIN_CONFIG,
      byokConfig: {},
      customModels: {},
    };
  }

  return {
    adminConfig: sanitizeAIAdminConfig(safeParse(row.adminConfigJson, DEFAULT_AI_ADMIN_CONFIG)),
    byokConfig: sanitizeBYOKConfig(safeParse(row.byokConfigJson, {})),
    customModels: sanitizeCustomModelsConfig(safeParse(row.customModelsJson, {})),
  };
}

export async function savePersistedAISettings(params: {
  userId: string;
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
  customModels?: ProviderCustomModelsConfig;
}) {
  const convex = getConvexClient();
  await convex.mutation(api.aiSettings.upsertForUser, {
    userId: params.userId,
    adminConfigJson: JSON.stringify(sanitizeAIAdminConfig(params.adminConfig)),
    byokConfigJson: JSON.stringify(sanitizeBYOKConfig(params.byokConfig)),
    customModelsJson: params.customModels ? JSON.stringify(sanitizeCustomModelsConfig(params.customModels)) : undefined,
  });
}

// --- Global admin model config (singleton) ---

export async function getGlobalAdminModelConfig(): Promise<AIAdminConfig> {
  const convex = getConvexClient();
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
  const convex = getConvexClient();
  await convex.mutation(api.aiSettings.upsertAdminModelConfig, {
    configJson: JSON.stringify(sanitizeAIAdminConfig(params.config)),
    updatedBy: params.updatedBy,
  });
}

// --- User custom models ---

export async function saveUserCustomModels(params: {
  userId: string;
  customModels: ProviderCustomModelsConfig;
}) {
  const convex = getConvexClient();
  await convex.mutation(api.aiSettings.updateUserCustomModels, {
    userId: params.userId,
    customModelsJson: JSON.stringify(sanitizeCustomModelsConfig(params.customModels)),
  });
}

export async function getUserCustomModels(userId: string): Promise<ProviderCustomModelsConfig> {
  const convex = getConvexClient();
  const row = await convex.query(api.aiSettings.getByUserId, { userId }) as StoredAISettingsRow | null;
  return sanitizeCustomModelsConfig(safeParse(row?.customModelsJson, {}));
}

// --- Admin audit ---

export async function addAIAdminAudit(params: {
  userId: string;
  email: string;
  action: string;
  details: unknown;
}) {
  const convex = getConvexClient();
  await convex.mutation(api.aiSettings.addAdminAudit, {
    userId: params.userId,
    email: params.email,
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

export async function listAIAdminAudit(params: {
  userId: string;
  limit?: number;
}): Promise<AIAdminAuditEntry[]> {
  const convex = getConvexClient();
  const rows = await convex.query(api.aiSettings.listAdminAuditByUser, {
    userId: params.userId,
    limit: params.limit,
  });

  return (Array.isArray(rows) ? rows : []) as AIAdminAuditEntry[];
}
