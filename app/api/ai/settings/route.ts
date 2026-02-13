import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { isAdminEmail } from '@/lib/admin-access';
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

  const isAdmin = isAdminEmail(user.primaryEmail);

  // Always read the global admin config (visible to all users for model filtering)
  const globalAdminConfig = await getGlobalAdminModelConfig();

  const persisted = await getPersistedAISettings(user.id);

  return NextResponse.json({
    isAdmin,
    adminConfig: globalAdminConfig,
    byokConfig: persisted.byokConfig,
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

  const isAdmin = isAdminEmail(user.primaryEmail);

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
        userId: user.id,
        email: user.primaryEmail || '',
        action: 'ai.admin_config.updated',
        details: adminDiff.details,
      });
    }
  }

  // --- BYOK config: save per-user ---
  if (parsedBody.data.byokConfig !== undefined) {
    const requestedByok = sanitizeBYOKConfig(parsedBody.data.byokConfig);
    const persisted = await getPersistedAISettings(user.id);
    await savePersistedAISettings({
      userId: user.id,
      adminConfig: persisted.adminConfig,
      byokConfig: requestedByok,
      customModels: persisted.customModels,
    });
  }

  // --- Custom models: save per-user ---
  if (parsedBody.data.customModels !== undefined) {
    const requestedCustomModels = sanitizeCustomModelsConfig(parsedBody.data.customModels);
    await saveUserCustomModels({
      userId: user.id,
      customModels: requestedCustomModels,
    });
  }

  // Return current state
  const globalAdminConfig = await getGlobalAdminModelConfig();
  const userCustomModels = await getUserCustomModels(user.id);
  const persisted = await getPersistedAISettings(user.id);

  return NextResponse.json({
    success: true,
    isAdmin,
    adminConfig: globalAdminConfig,
    byokConfig: persisted.byokConfig,
    customModels: userCustomModels,
  });
}
