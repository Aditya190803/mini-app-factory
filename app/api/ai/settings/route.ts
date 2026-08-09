import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { isAdminUser } from '@/lib/admin-access';
import {
  sanitizeAIAdminConfig,
  sanitizeBYOKConfig,
  sanitizeCustomModelsConfig,
  type AIAdminConfig,
} from '@/lib/ai-admin-config';
import {
  addAIAdminAudit,
  getPersistedAISettings,
  savePersistedAISettings,
  getGlobalAdminModelConfig,
  saveGlobalAdminModelConfig,
  saveUserCustomModels,
  getUserCustomModels,
} from '@/lib/ai-settings-store';

const updateSchema = z.object({
  adminConfig: z.unknown().optional(),
  byokConfig: z.unknown().optional(),
  customModels: z.unknown().optional(),
});

/** Collapse a BYOK key map to a presence map, so no secret leaves the server. */
function toByokStatus(byokConfig: Record<string, string | undefined>): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const [providerId, key] of Object.entries(byokConfig)) {
    status[providerId] = typeof key === 'string' && key.length > 0;
  }
  return status;
}

function getAdminConfigDiff(previous: AIAdminConfig, next: AIAdminConfig) {
  const changedProviders: string[] = [];
  const providerChanges: Array<{
    providerId: string;
    changes: string[];
    before: {
      enabled: boolean;
      defaultModel: string;
      customModelsCount: number;
      visibleModelsCount: number;
    };
    after: {
      enabled: boolean;
      defaultModel: string;
      customModelsCount: number;
      visibleModelsCount: number;
    };
  }> = [];

  let totalVisibleDelta = 0;
  let totalCustomDelta = 0;

  for (const providerId of Object.keys(next.providers)) {
    const prev = previous.providers[providerId as keyof AIAdminConfig['providers']];
    const curr = next.providers[providerId as keyof AIAdminConfig['providers']];
    if (!prev || !curr) continue;

    const changes: string[] = [];
    if (prev.enabled !== curr.enabled) {
      changes.push(`enabled: ${prev.enabled ? 'on' : 'off'} → ${curr.enabled ? 'on' : 'off'}`);
    }
    if (prev.defaultModel !== curr.defaultModel) {
      changes.push(`default: ${prev.defaultModel} → ${curr.defaultModel}`);
    }

    const customAdded = curr.customModels.filter((model) => !prev.customModels.includes(model));
    const customRemoved = prev.customModels.filter((model) => !curr.customModels.includes(model));
    if (customAdded.length > 0 || customRemoved.length > 0) {
      if (customAdded.length > 0) changes.push(`custom +${customAdded.length}`);
      if (customRemoved.length > 0) changes.push(`custom -${customRemoved.length}`);
    }

    const visibleAdded = curr.visibleModels.filter((model) => !prev.visibleModels.includes(model));
    const visibleRemoved = prev.visibleModels.filter((model) => !curr.visibleModels.includes(model));
    if (visibleAdded.length > 0 || visibleRemoved.length > 0) {
      if (visibleAdded.length > 0) changes.push(`visible +${visibleAdded.length}`);
      if (visibleRemoved.length > 0) changes.push(`visible -${visibleRemoved.length}`);
    }

    if (changes.length > 0) {
      changedProviders.push(providerId);
      totalVisibleDelta += curr.visibleModels.length - prev.visibleModels.length;
      totalCustomDelta += curr.customModels.length - prev.customModels.length;
      providerChanges.push({
        providerId,
        changes,
        before: {
          enabled: prev.enabled,
          defaultModel: prev.defaultModel,
          customModelsCount: prev.customModels.length,
          visibleModelsCount: prev.visibleModels.length,
        },
        after: {
          enabled: curr.enabled,
          defaultModel: curr.defaultModel,
          customModelsCount: curr.customModels.length,
          visibleModelsCount: curr.visibleModels.length,
        },
      });
    }
  }

  const providerOrderChanged = JSON.stringify(previous.providerOrder) !== JSON.stringify(next.providerOrder);
  const details = {
    changedProviders,
    providerChanges,
    providerOrderChanged,
    providerOrder: providerOrderChanged
      ? {
        before: previous.providerOrder,
        after: next.providerOrder,
      }
      : null,
    summary: {
      providersChanged: changedProviders.length,
      totalVisibleDelta,
      totalCustomDelta,
    },
  };

  const hasChanges = changedProviders.length > 0 || providerOrderChanged;
  return {
    hasChanges,
    details,
  };
}

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const isAdmin = isAdminUser(user);

  // Always read the global admin config (visible to all users for model filtering)
  const globalAdminConfig = await getGlobalAdminModelConfig();

  const persisted = await getPersistedAISettings();

  return NextResponse.json({
    isAdmin,
    adminConfig: globalAdminConfig,
    // Never return the keys themselves — only whether each provider has one. The UI only needs
    // presence, and echoing secrets back to the browser turns any XSS into key exfiltration.
    byokStatus: toByokStatus(persisted.byokConfig),
    customModels: persisted.customModels,
  });
}

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const parsedBody = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const isAdmin = isAdminUser(user);

  // --- Admin config: save globally ---
  if (isAdmin && parsedBody.data.adminConfig !== undefined) {
    const previousGlobal = await getGlobalAdminModelConfig();
    const requestedAdmin = sanitizeAIAdminConfig(parsedBody.data.adminConfig);

    await saveGlobalAdminModelConfig({
      config: requestedAdmin,
      updatedBy: user.id,
    });

    const adminDiff = getAdminConfigDiff(previousGlobal, requestedAdmin);
    if (adminDiff.hasChanges) {
      await addAIAdminAudit({
        action: 'ai.admin_config.updated',
        details: adminDiff.details,
      });
    }
  }

  // --- BYOK config: save per-user ---
  // Merge rather than replace. The client no longer holds the full key map (GET returns presence
  // only), so it can only send the providers it actually changed. An explicit empty string means
  // "clear this provider"; an absent provider is left untouched.
  if (parsedBody.data.byokConfig !== undefined) {
    const requestedByok = sanitizeBYOKConfig(parsedBody.data.byokConfig);
    const persisted = await getPersistedAISettings();

    const mergedByok = { ...persisted.byokConfig };
    for (const [providerId, key] of Object.entries(requestedByok)) {
      if (typeof key === 'string' && key.length > 0) {
        mergedByok[providerId as keyof typeof mergedByok] = key;
      } else {
        delete mergedByok[providerId as keyof typeof mergedByok];
      }
    }

    await savePersistedAISettings({
      adminConfig: persisted.adminConfig,
      byokConfig: mergedByok,
      customModels: persisted.customModels,
    });
  }

  // --- Custom models: save per-user ---
  if (parsedBody.data.customModels !== undefined) {
    const requestedCustomModels = sanitizeCustomModelsConfig(parsedBody.data.customModels);
    await saveUserCustomModels({
      customModels: requestedCustomModels,
    });
  }

  // Return current state
  const globalAdminConfig = await getGlobalAdminModelConfig();
  const userCustomModels = await getUserCustomModels();
  const persisted = await getPersistedAISettings();

  return NextResponse.json({
    success: true,
    isAdmin,
    adminConfig: globalAdminConfig,
    byokStatus: toByokStatus(persisted.byokConfig),
    customModels: userCustomModels,
  });
}
