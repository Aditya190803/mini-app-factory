'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Settings2, ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { AI_PROVIDER_IDS, DEFAULT_MODEL_OPTIONS, type AIProviderId } from '@/lib/ai-admin-config';
import { getStoredAIAdminConfig, setStoredAIAdminConfig } from '@/lib/ai-admin-client';

const providerLabel: Record<AIProviderId, string> = {
  google: 'Google',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  cerebras: 'Cerebras',
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
    google: '',
    groq: '',
    openrouter: '',
    cerebras: '',
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

  const addCustomModel = (providerId: AIProviderId) => {
    const candidate = newModelInput[providerId].trim();
    if (!candidate) return;

    updateProvider(providerId, (provider) => ({
      ...provider,
      customModels: provider.customModels.includes(candidate)
        ? provider.customModels
        : [...provider.customModels, candidate],
    }));

    setNewModelInput((prev) => ({ ...prev, [providerId]: '' }));
  };

  const removeCustomModel = (providerId: AIProviderId, modelId: string) => {
    updateProvider(providerId, (provider) => ({
      ...provider,
      customModels: provider.customModels.filter((model) => model !== modelId),
    }));
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/settings')}
              className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
                Admin Console
              </h1>
              <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
                AI Provider Controls
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="text-[10px] font-mono uppercase border-[var(--border)]"
            onClick={() => router.push('/admin/models')}
          >
            Manage Models
          </Button>
        </div>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <div className="flex items-center gap-2 text-[var(--secondary-text)]">
            <Shield className="w-4 h-4" />
            <h2 className="text-xs font-mono uppercase tracking-widest">Provider Management</h2>
          </div>
          <div className="text-[11px] font-mono text-[var(--muted-text)]">
            Enable providers, define defaults, and maintain custom model lists for users.
          </div>
          <div className="text-[9px] font-mono uppercase text-[var(--muted-text)]">
            {saveState === 'saving' && 'Saving changes...'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && 'Save failed (local cache kept)'}
          </div>

          {isLoading ? (
            <div className="text-[11px] font-mono text-[var(--muted-text)]">Loading admin configuration...</div>
          ) : (
            <div className="grid gap-4">
              <div className="border border-[var(--border)] rounded-md p-4 space-y-2">
                <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Provider Priority (Fallback Order)</div>
                <div className="grid gap-2">
                  {orderedProviders.map((providerId, index) => (
                    <div key={`order-${providerId}`} className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
                      <div className="text-[11px] font-mono text-[var(--secondary-text)]">
                        {index + 1 === 1 ? 'Primary' : `${index + 1}${index + 1 === 2 ? 'nd' : index + 1 === 3 ? 'rd' : 'th'} fallback`} · {providerLabel[providerId]}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          className="h-7 px-2 border-[var(--border)]"
                          onClick={() => moveProvider(providerId, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          className="h-7 px-2 border-[var(--border)]"
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
                  ...DEFAULT_MODEL_OPTIONS[providerId],
                  ...provider.customModels,
                  provider.defaultModel,
                ]);
                const modelOptions = Array.from(optionSet);
                return (
                  <div key={providerId} className="border border-[var(--border)] rounded-md px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase text-[var(--secondary-text)]">
                        <span className="w-5 h-5 border border-[var(--border)] rounded-full inline-flex items-center justify-center text-[9px] text-[var(--foreground)]">
                          {providerLabel[providerId].slice(0, 1)}
                        </span>
                        {providerLabel[providerId]}
                      </div>
                      <label className="text-[10px] font-mono uppercase text-[var(--muted-text)] flex items-center gap-2">
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
                        <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Default model</div>
                        <select
                          value={provider.defaultModel}
                          onChange={(event) => updateProvider(providerId, (prev) => ({ ...prev, defaultModel: event.target.value }))}
                          className="w-full h-9 px-3 border border-[var(--border)] bg-[var(--background)] text-[11px] font-mono text-[var(--foreground)]"
                        >
                          {modelOptions.map((modelId) => (
                            <option key={`${providerId}-${modelId}`} value={modelId}>
                              {modelId}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--muted-text)] flex items-end">
                        Applied globally via persisted admin config.
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Custom models</div>
                      <div className="flex gap-2">
                        <Input
                          value={newModelInput[providerId]}
                          onChange={(event) => setNewModelInput((prev) => ({ ...prev, [providerId]: event.target.value }))}
                          className="text-[11px] font-mono"
                          placeholder="add model id"
                        />
                        <Button
                          variant="outline"
                          className="text-[10px] font-mono uppercase border-[var(--border)]"
                          onClick={() => addCustomModel(providerId)}
                        >
                          <Settings2 className="w-3 h-3 mr-1" />
                          Add Model
                        </Button>
                      </div>

                      {provider.customModels.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {provider.customModels.map((modelId) => (
                            <button
                              key={modelId}
                              onClick={() => removeCustomModel(providerId, modelId)}
                              className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--muted-text)] hover:text-[var(--foreground)]"
                            >
                              {modelId} ×
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-[var(--muted-text)]">No custom models configured.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">Recent Admin Activity</h2>
            <Button
              variant="outline"
              className="h-8 px-3 text-[10px] font-mono uppercase border-[var(--border)]"
              onClick={() => void loadAudit()}
              disabled={isAuditLoading}
            >
              {isAuditLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {isAuditLoading ? (
            <div className="text-[11px] font-mono text-[var(--muted-text)]">Loading activity...</div>
          ) : auditEntries.length === 0 ? (
            <div className="text-[11px] font-mono text-[var(--muted-text)]">No admin changes logged yet.</div>
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
                  <div key={entry._id} className="border border-[var(--border)] rounded-md px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] font-mono text-[var(--foreground)] uppercase">{entry.action}</div>
                      <div className="text-[10px] font-mono text-[var(--muted-text)]">
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-[var(--secondary-text)]">{entry.email}</div>
                    {detailLines.length > 0 && (
                      <div className="space-y-1">
                        {detailLines.map((line, index) => (
                          <div key={`${entry._id}-detail-${index}`} className="text-[10px] font-mono text-[var(--muted-text)]">
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
      </div>
    </div>
  );
}
