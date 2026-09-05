'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input } from '@/components/kit';
import { TopBar } from '@/components/shell/top-bar';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { AccountMenu } from '@/components/shell/account-menu';
import {
  AI_PROVIDER_IDS,
  type AIAdminConfig,
  type AIProviderId,
  DEFAULT_AI_ADMIN_CONFIG,
  sanitizeAIAdminConfig,
} from '@/lib/ai-admin-config';
import { setStoredAIAdminConfig } from '@/lib/ai-admin-client';

type ProviderCatalogModel = {
  id: string;
  name: string;
  isDefault: boolean;
  isCustom: boolean;
};

type ProviderCatalog = {
  providerId: AIProviderId;
  providerName: string;
  enabled: boolean;
  defaultModel: string;
  models: ProviderCatalogModel[];
};

const emptySearchState: Record<AIProviderId, string> = {
  opencode: '',
  openrouter: '',
};

export default function AIModelManagement() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [adminConfig, setAdminConfig] = useState<AIAdminConfig>(DEFAULT_AI_ADMIN_CONFIG);
  const [providerCatalogs, setProviderCatalogs] = useState<ProviderCatalog[]>([]);
  const [searchByProvider, setSearchByProvider] = useState(emptySearchState);

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsResp, catalogResp] = await Promise.all([
          fetch('/api/ai/settings'),
          fetch('/api/admin/models'),
        ]);

        if (settingsResp.ok) {
          const settings = await settingsResp.json();
          if (settings.adminConfig) {
            setAdminConfig(sanitizeAIAdminConfig(settings.adminConfig));
          }
        }

        if (catalogResp.ok) {
          const catalog = await catalogResp.json();
          setProviderCatalogs(Array.isArray(catalog.providers) ? catalog.providers : []);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const orderedCatalogs = useMemo(() => {
    const order = adminConfig.providerOrder.length > 0 ? adminConfig.providerOrder : AI_PROVIDER_IDS;
    return [...providerCatalogs].sort((a, b) => order.indexOf(a.providerId) - order.indexOf(b.providerId));
  }, [adminConfig.providerOrder, providerCatalogs]);

  const updateProviderConfig = (providerId: AIProviderId, updater: (current: AIAdminConfig['providers'][AIProviderId]) => AIAdminConfig['providers'][AIProviderId]) => {
    setAdminConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: updater(prev.providers[providerId]),
      },
    }));
  };

  const toggleVisible = (providerId: AIProviderId, modelId: string, allModels: ProviderCatalogModel[]) => {
    updateProviderConfig(providerId, (provider) => {
      if (provider.defaultModel === modelId) return provider;

      // If currently empty, it means everything is visible.
      // To hide one, we must transition to an explicit allow-list.
      if (provider.visibleModels.length === 0) {
        return {
          ...provider,
          visibleModels: allModels
            .map((m) => m.id)
            .filter((id) => id !== modelId),
        };
      }

      const isVisible = provider.visibleModels.includes(modelId);
      const nextList = isVisible
        ? provider.visibleModels.filter((entry) => entry !== modelId)
        : [...provider.visibleModels, modelId];

      // If the resulting list contains all models, we can revert to empty for cleaner storage
      if (nextList.length >= allModels.length) {
        return { ...provider, visibleModels: [] };
      }

      return {
        ...provider,
        visibleModels: nextList,
      };
    });
  };

  const setDefaultModel = (providerId: AIProviderId, modelId: string) => {
    updateProviderConfig(providerId, (provider) => {
      // If we are using an allow-list, ensure the new default is in it
      const nextVisible = provider.visibleModels.length > 0 && !provider.visibleModels.includes(modelId)
        ? [...provider.visibleModels, modelId]
        : provider.visibleModels;

      return {
        ...provider,
        defaultModel: modelId,
        visibleModels: nextVisible,
      };
    });
  };

  const hideOrShowAll = (providerId: AIProviderId, allModels: ProviderCatalogModel[], mode: 'hide' | 'show') => {
    if (mode === 'show') {
      updateProviderConfig(providerId, (p) => ({ ...p, visibleModels: [] }));
    } else {
      updateProviderConfig(providerId, (p) => ({ ...p, visibleModels: [p.defaultModel] }));
    }
  };

  const saveChanges = async () => {
    setIsSaving(true);
    setSaveMessage('Saving...');
    const toastId = toast.loading('Saving model visibility...', {
      description: 'Applying your admin model configuration.',
    });

    try {
      const resp = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminConfig }),
      });

      if (!resp.ok) {
        setSaveMessage('Save failed');
        toast.error('Save failed', {
          id: toastId,
          description: 'Could not persist model visibility settings.',
        });
        return;
      }

      const data = await resp.json();
      const sanitized = sanitizeAIAdminConfig(data.adminConfig ?? adminConfig);
      setAdminConfig(sanitized);
      setStoredAIAdminConfig(sanitized);      setSaveMessage('Saved');
      toast.success('Saved', {
        id: toastId,
        description: 'Model visibility settings updated successfully.',
      });
      setTimeout(() => setSaveMessage(''), 1500);
    } catch {
      setSaveMessage('Save failed');
      toast.error('Save failed', {
        id: toastId,
        description: 'Network error while updating model visibility settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        crumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'AI console', href: '/admin' },
          { label: 'Models' },
        ]}
      >
        <ThemeToggle className="mr-1 hidden sm:inline-flex" />
        <AccountMenu isAdmin />
      </TopBar>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-10 sm:px-6">
        <div className="ticked flex flex-wrap items-end justify-between gap-4 pb-3">
          <div>
            <h1 className="text-2xl font-medium tracking-[-0.024em]">Model visibility</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Which models users can pick, and which one is offered by default.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-xs text-[var(--muted-foreground)]">
              {saveMessage}
            </span>
            <Button
              intent="primary"
              onClick={saveChanges}
              busy={isSaving}
              disabled={isLoading}
            >
              Save changes
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="border border-[var(--rule)] bg-[var(--surface-1)] p-6 text-xs font-mono text-[var(--muted-foreground)]">
            Loading model catalogs...
          </div>
        ) : (
          <div className="grid gap-4">
            {orderedCatalogs.map((provider) => {
              const providerConfig = adminConfig.providers[provider.providerId];
              const search = searchByProvider[provider.providerId].trim().toLowerCase();
              const filteredModels = provider.models.filter((model) => {
                if (!search) return true;
                return model.id.toLowerCase().includes(search) || model.name.toLowerCase().includes(search);
              });
              const visibleModels = provider.models.filter(
                (model) => providerConfig.visibleModels.length === 0 || providerConfig.visibleModels.includes(model.id) || providerConfig.defaultModel === model.id
              );
              const visibleCount = visibleModels.length;
              const hiddenCount = Math.max(provider.models.length - visibleCount, 0);

              return (
                <section key={provider.providerId} className="border border-[var(--rule)] bg-[var(--surface-1)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-[0.08em] text-[var(--foreground)]">
                        {provider.providerName}
                      </div>
                      <div className="text-xs font-mono text-[var(--muted-foreground)]">
                        {visibleCount} visible of {provider.models.length} total
                      </div>
                      <div className="text-xs font-mono text-[var(--muted-foreground)]">
                        {hiddenCount} hidden
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        className="h-8 px-3 text-xs font-mono uppercase border-[var(--rule)]"
                        onClick={() => hideOrShowAll(provider.providerId, provider.models, 'hide')}
                      >
                        Hide All
                      </Button>
                      <Button
                        className="h-8 px-3 text-xs font-mono uppercase border-[var(--rule)]"
                        onClick={() => hideOrShowAll(provider.providerId, provider.models, 'show')}
                      >
                        Show All
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                      <Input
                        value={searchByProvider[provider.providerId]}
                        onChange={(event) => setSearchByProvider((prev) => ({ ...prev, [provider.providerId]: event.target.value }))}
                        className="pl-9 text-xs font-mono"
                        placeholder={`search ${provider.providerName.toLowerCase()} models`}
                      />
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={providerConfig.defaultModel}
                        onChange={(event) => setDefaultModel(provider.providerId, event.target.value)}
                        className="w-full h-9 px-3 border border-[var(--rule)] bg-[var(--background)] text-xs font-mono text-[var(--foreground)]"
                      >
                        {visibleModels.map((model) => (
                          <option key={`${provider.providerId}-default-${model.id}`} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        className="h-9 px-3 text-xs font-mono uppercase border-[var(--rule)]"
                        onClick={() => setSearchByProvider((prev) => ({ ...prev, [provider.providerId]: '' }))}
                        disabled={!searchByProvider[provider.providerId]}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto border border-[var(--rule)] rounded-md">
                    {filteredModels.length === 0 ? (
                      <div className="px-3 py-4 text-xs font-mono text-[var(--muted-foreground)]">No models match this search.</div>
                    ) : (
                      filteredModels.map((model) => {
                        const isDefault = providerConfig.defaultModel === model.id;
                        const isVisible = providerConfig.visibleModels.length === 0 || providerConfig.visibleModels.includes(model.id) || isDefault;

                        return (
                          <div
                            key={`${provider.providerId}-${model.id}`}
                            className="px-3 py-2 border-b border-[var(--rule)] last:border-b-0 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-mono text-[var(--foreground)] truncate">{model.name}</div>
                              <div className="text-xs font-mono text-[var(--muted-foreground)] truncate">{model.id}</div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isDefault && (
                                <span className="text-xs px-2 py-1 border border-[var(--primary)] text-[var(--primary)] font-mono uppercase">
                                  Default
                                </span>
                              )}
                              <Button
                                className="h-8 px-2 border-[var(--rule)]"
                                onClick={() => toggleVisible(provider.providerId, model.id, provider.models)}
                                disabled={isDefault}
                                title={isDefault ? 'Default model is always visible' : isVisible ? 'Hide model' : 'Show model'}
                              >
                                {!isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
