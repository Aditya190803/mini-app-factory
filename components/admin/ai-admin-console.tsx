'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/kit';
import { TopBar } from '@/components/shell/top-bar';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { AccountMenu } from '@/components/shell/account-menu';
import { Shield, Settings2, ArrowUp, ArrowDown } from 'lucide-react';
import { AI_PROVIDER_IDS, type AIProviderId } from '@/lib/ai-admin-config';
import { getStoredAIAdminConfig, setStoredAIAdminConfig } from '@/lib/ai-admin-client';

const providerLabel: Record<AIProviderId, string> = {
  opencode: 'OpenCode Zen',
  openrouter: 'OpenRouter',
};

type ProviderCatalog = {
  providerId: AIProviderId;
  models: Array<{ id: string; hidden?: boolean }>;
};

function prettyProviderName(id: string) {
  if (id === 'provider-priority') return 'Provider Priority';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export default function AIAdminConsole() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditLoading, setIsAuditLoading] = useState(true);
  const [providerCatalogs, setProviderCatalogs] = useState<ProviderCatalog[]>([]);
  const [auditEntries, setAuditEntries] = useState<Array<{
    _id: string;
    email: string;
    action: string;
    detailsJson: string;
    createdAt: number;
  }>>([]);
  const [aiConfig, setAiConfig] = useState(() => getStoredAIAdminConfig());
  const [newModelInput, setNewModelInput] = useState<Record<AIProviderId, string>>({
    opencode: '',
    openrouter: '',
  });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const orderedProviders = aiConfig.providerOrder.length > 0
    ? aiConfig.providerOrder
    : [...AI_PROVIDER_IDS];

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsResp, auditResp, modelsResp] = await Promise.all([
          fetch('/api/ai/settings'),
          fetch('/api/admin/audit?limit=20'),
          fetch('/api/admin/models'),
        ]);

        if (settingsResp.ok) {
          const data = await settingsResp.json();
          if (data.adminConfig) {
            setAiConfig(data.adminConfig);
            setStoredAIAdminConfig(data.adminConfig);
          }
        }

        if (auditResp.ok) {
          const auditData = await auditResp.json();
          setAuditEntries(Array.isArray(auditData.entries) ? auditData.entries : []);
        }

        if (modelsResp.ok) {
          const modelsData = await modelsResp.json();
          setProviderCatalogs(Array.isArray(modelsData.providers) ? modelsData.providers : []);
        }
      } finally {
        setIsLoading(false);
        setIsAuditLoading(false);
      }
    };
    void load();
  }, []);

  const loadAudit = async () => {
    try {
      setIsAuditLoading(true);
      const resp = await fetch('/api/admin/audit?limit=20');
      if (!resp.ok) return;
      const data = await resp.json();
      setAuditEntries(Array.isArray(data.entries) ? data.entries : []);
    } finally {
      setIsAuditLoading(false);
    }
  };

  const persist = async (nextConfig: typeof aiConfig) => {
    setSaveState('saving');
    setStoredAIAdminConfig(nextConfig);
    try {
      const resp = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminConfig: nextConfig }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.adminConfig) {
          setAiConfig(data.adminConfig);
          setStoredAIAdminConfig(data.adminConfig);
        }
      }
      void loadAudit();
      setSaveState('saved');
      setTimeout(() => setSaveState((prev) => (prev === 'saved' ? 'idle' : prev)), 1200);
    } catch {
      setSaveState('error');
    }
  };

  const updateProvider = (
    providerId: AIProviderId,
    updater: (provider: (typeof aiConfig.providers)[AIProviderId]) => (typeof aiConfig.providers)[AIProviderId]
  ) => {
    setAiConfig((prev) => {
      const next = {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: updater(prev.providers[providerId]),
        },
      };
      void persist(next);
      return next;
    });
  };

  const moveProvider = (providerId: AIProviderId, direction: 'up' | 'down') => {
    setAiConfig((prev) => {
      const order = [...prev.providerOrder];
      const index = order.indexOf(providerId);
      if (index === -1) return prev;

      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= order.length) return prev;

      [order[index], order[target]] = [order[target], order[index]];
      const next = { ...prev, providerOrder: order };
      void persist(next);
      return next;
    });
  };

  const addCustomModelId = (providerId: AIProviderId, candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;

    updateProvider(providerId, (provider) => ({
      ...provider,
      customModels: provider.customModels.includes(trimmed)
        ? provider.customModels
        : [...provider.customModels, trimmed],
    }));
  };

  const addCustomModel = (providerId: AIProviderId) => {
    addCustomModelId(providerId, newModelInput[providerId]);
    setNewModelInput((prev) => ({ ...prev, [providerId]: '' }));
  };

  const removeCustomModel = (providerId: AIProviderId, modelId: string) => {
    updateProvider(providerId, (provider) => ({
      ...provider,
      customModels: provider.customModels.filter((model) => model !== modelId),
    }));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'AI console' }]}>
        <ThemeToggle className="mr-1 hidden sm:inline-flex" />
        <AccountMenu isAdmin />
      </TopBar>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-10 sm:px-6">
        <div className="ticked flex flex-wrap items-end justify-between gap-4 pb-3">
          <div>
            <h1 className="text-2xl font-medium tracking-[-0.024em]">AI console</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Provider defaults for this deployment. Every change here is audit logged.
            </p>
          </div>
          <Button onClick={() => router.push('/admin/models')}>Model visibility</Button>
        </div>

        <section className="border border-[var(--rule)] bg-[var(--surface-1)] p-6 space-y-4">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <Shield className="w-4 h-4" />
            <h2 className="text-xs font-mono uppercase tracking-[0.08em]">Provider Management</h2>
          </div>
          <div className="text-xs font-mono text-[var(--muted-foreground)]">
            Enable providers, define defaults, and maintain custom model lists for users.
          </div>
          <div className="text-xs font-mono uppercase text-[var(--muted-foreground)]">
            {saveState === 'saving' && 'Saving changes...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Save failed (local cache kept)'}
          </div>

          {isLoading ? (
            <div className="text-xs font-mono text-[var(--muted-foreground)]">Loading admin configuration...</div>
          ) : (
            <div className="grid gap-4">
              <div className="border border-[var(--rule)] rounded-md p-4 space-y-2">
                <div className="text-xs font-mono uppercase text-[var(--muted-foreground)]">Provider Priority (Fallback Order)</div>
                <div className="grid gap-2">
                  {orderedProviders.map((providerId, index) => (
                    <div key={`order-${providerId}`} className="flex items-center justify-between border border-[var(--rule)] rounded-md px-3 py-2">
                      <div className="text-xs font-mono text-[var(--foreground)]">
                        {index + 1 === 1 ? 'Primary' : `${index + 1}${index + 1 === 2 ? 'nd' : index + 1 === 3 ? 'rd' : 'th'} fallback`} · {providerLabel[providerId]}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          className="h-7 px-2 border-[var(--rule)]"
                          onClick={() => moveProvider(providerId, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          className="h-7 px-2 border-[var(--rule)]"
                          onClick={() => moveProvider(providerId, 'down')}
                          disabled={index === orderedProviders.length - 1}
                        >
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {orderedProviders.map((providerId) => {
                const provider = aiConfig.providers[providerId];
                const catalog = providerCatalogs.find((entry) => entry.providerId === providerId);
                const catalogVisibleModels = (catalog?.models ?? [])
                  .filter((model) => !model.hidden || model.id === provider.defaultModel)
                  .map((model) => model.id);
                const optionSet = new Set<string>([
                  ...catalogVisibleModels,
                  ...provider.customModels,
                  provider.defaultModel,
                ]);
                const modelOptions = Array.from(optionSet);
                return (
                  <div key={providerId} className="border border-[var(--rule)] rounded-md px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 text-xs font-mono uppercase text-[var(--foreground)]">
                        <span className="w-5 h-5 border border-[var(--rule)] rounded-full inline-flex items-center justify-center text-xs text-[var(--foreground)]">
                          {providerLabel[providerId].slice(0, 1)}
                        </span>
                        {providerLabel[providerId]}
                      </div>
                      <label className="text-xs font-mono uppercase text-[var(--muted-foreground)] flex items-center gap-2">
                        Enabled
                        <input
                          type="checkbox"
                          checked={provider.enabled}
                          onChange={(event) => updateProvider(providerId, (prev) => ({ ...prev, enabled: event.target.checked }))}
                        />
                      </label>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-xs font-mono uppercase text-[var(--muted-foreground)]">Default model</div>
                        <select
                          value={provider.defaultModel}
                          onChange={(event) => updateProvider(providerId, (prev) => ({ ...prev, defaultModel: event.target.value }))}
                          className="w-full h-9 px-3 border border-[var(--rule)] bg-[var(--background)] text-xs font-mono text-[var(--foreground)]"
                        >
                          {modelOptions.map((modelId) => (
                            <option key={`${providerId}-${modelId}`} value={modelId}>
                              {modelId}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-xs font-mono text-[var(--muted-foreground)] flex items-end">
                        Applied globally via persisted admin config.
                      </div>
                    </div>

                    {providerId === 'openrouter' && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono uppercase text-[var(--muted-foreground)]">Custom models</div>
                      <div className="flex gap-2">
                        <Input
                          value={newModelInput[providerId]}
                          onChange={(event) => setNewModelInput((prev) => ({ ...prev, [providerId]: event.target.value }))}
                          className="text-xs font-mono"
                          placeholder="openrouter/free or provider/model:free"
                        />
                        <Button
                          className="text-xs font-mono uppercase border-[var(--rule)]"
                          onClick={() => addCustomModel(providerId)}
                        >
                          <Settings2 className="w-3 h-3 mr-1" />
                          Add Model
                        </Button>
                      </div>
                      <div className="text-xs font-mono text-[var(--muted-foreground)]">
                        OpenRouter is limited to free models (`openrouter/free` or ids ending in `:free`).
                      </div>

                      {provider.customModels.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {provider.customModels.map((modelId) => (
                            <button
                              key={modelId}
                              onClick={() => removeCustomModel(providerId, modelId)}
                              className="px-2 py-1 border border-[var(--rule)] text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            >
                              {modelId} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-[var(--muted-foreground)]">No custom models configured.</div>
                      )}

                      <div className="text-xs font-mono text-[var(--muted-foreground)]">
                        The selector lists every free model from OpenRouter's live catalog.
                      </div>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border border-[var(--rule)] bg-[var(--surface-1)] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-mono uppercase tracking-[0.08em] text-[var(--foreground)]">Recent Admin Activity</h2>
            <Button
              className="h-8 px-3 text-xs font-mono uppercase border-[var(--rule)]"
              onClick={() => void loadAudit()}
              disabled={isAuditLoading}
            >
              {isAuditLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {isAuditLoading ? (
            <div className="text-xs font-mono text-[var(--muted-foreground)]">Loading activity...</div>
          ) : auditEntries.length === 0 ? (
            <div className="text-xs font-mono text-[var(--muted-foreground)]">No admin changes logged yet.</div>
          ) : (
            <div className="space-y-2">
              {auditEntries.map((entry) => {
                let detailLines: string[] = [];
                try {
                  const parsed = JSON.parse(entry.detailsJson) as {
                    changedProviders?: string[];
                    providerChanges?: Array<{ providerId: string; changes?: string[] }>;
                    providerOrderChanged?: boolean;
                    providerOrder?: { before?: string[]; after?: string[] } | null;
                    summary?: {
                      providersChanged?: number;
                      totalHiddenDelta?: number;
                      totalCustomDelta?: number;
                    };
                  };

                  if (parsed.summary) {
                    const parts: string[] = [];
                    if (typeof parsed.summary.providersChanged === 'number') {
                      parts.push(`${parsed.summary.providersChanged} provider(s) changed`);
                    }
                    if (typeof parsed.summary.totalHiddenDelta === 'number' && parsed.summary.totalHiddenDelta !== 0) {
                      const sign = parsed.summary.totalHiddenDelta > 0 ? '+' : '';
                      parts.push(`hidden ${sign}${parsed.summary.totalHiddenDelta}`);
                    }
                    if (typeof parsed.summary.totalCustomDelta === 'number' && parsed.summary.totalCustomDelta !== 0) {
                      const sign = parsed.summary.totalCustomDelta > 0 ? '+' : '';
                      parts.push(`custom ${sign}${parsed.summary.totalCustomDelta}`);
                    }
                    if (parts.length > 0) {
                      detailLines.push(parts.join(' · '));
                    }
                  }

                  if (Array.isArray(parsed.providerChanges) && parsed.providerChanges.length > 0) {
                    parsed.providerChanges.forEach((change) => {
                      if (!Array.isArray(change.changes) || change.changes.length === 0) return;
                      detailLines.push(`${prettyProviderName(change.providerId)}: ${change.changes.join(', ')}`);
                    });
                  } else if (Array.isArray(parsed.changedProviders) && parsed.changedProviders.length > 0) {
                    detailLines.push(`Providers: ${parsed.changedProviders.map(prettyProviderName).join(', ')}`);
                  }

                  if (parsed.providerOrderChanged && parsed.providerOrder) {
                    const beforeOrder = Array.isArray(parsed.providerOrder.before)
                      ? parsed.providerOrder.before.map(prettyProviderName).join(' → ')
                      : '';
                    const afterOrder = Array.isArray(parsed.providerOrder.after)
                      ? parsed.providerOrder.after.map(prettyProviderName).join(' → ')
                      : '';
                    if (beforeOrder && afterOrder) {
                      detailLines.push(`Priority: ${beforeOrder} → ${afterOrder}`);
                    } else {
                      detailLines.push('Provider priority updated');
                    }
                  }
                } catch {
                  detailLines = [];
                }

                return (
                  <div key={entry._id} className="border border-[var(--rule)] rounded-md px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-mono text-[var(--foreground)] uppercase">{entry.action}</div>
                      <div className="text-xs font-mono text-[var(--muted-foreground)]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-[var(--foreground)]">{entry.email}</div>
                    {detailLines.length > 0 && (
                      <div className="space-y-1">
                        {detailLines.map((line, index) => (
                          <div key={`${entry._id}-detail-${index}`} className="text-xs font-mono text-[var(--muted-foreground)]">
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
