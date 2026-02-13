'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  google: '',
  groq: '',
  openrouter: '',
  cerebras: '',
};

export default function AIModelManagement() {
  const router = useRouter();
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin')}
              className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
                Model Visibility
              </h1>
              <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
                Search · Hide/Show · Default Selection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase text-[var(--muted-text)]">{saveMessage}</span>
            <Button
              variant="outline"
              className="text-[10px] font-mono uppercase border-[var(--border)]"
              onClick={saveChanges}
              disabled={isSaving || isLoading}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="border border-[var(--border)] bg-[var(--background-surface)] p-6 text-[11px] font-mono text-[var(--muted-text)]">
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
                <section key={provider.providerId} className="border border-[var(--border)] bg-[var(--background-surface)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--secondary-text)]">
                        {provider.providerName}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--muted-text)]">
                        {visibleCount} visible of {provider.models.length} total
                      </div>
                      <div className="text-[10px] font-mono text-[var(--muted-text)]">
                        {hiddenCount} hidden
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-[10px] font-mono uppercase border-[var(--border)]"
                        onClick={() => hideOrShowAll(provider.providerId, provider.models, 'hide')}
                      >
                        Hide All
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 px-3 text-[10px] font-mono uppercase border-[var(--border)]"
                        onClick={() => hideOrShowAll(provider.providerId, provider.models, 'show')}
                      >
                        Show All
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)]" />
                      <Input
                        value={searchByProvider[provider.providerId]}
                        onChange={(event) => setSearchByProvider((prev) => ({ ...prev, [provider.providerId]: event.target.value }))}
                        className="pl-9 text-[11px] font-mono"
                        placeholder={`search ${provider.providerName.toLowerCase()} models`}
                      />
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={providerConfig.defaultModel}
                        onChange={(event) => setDefaultModel(provider.providerId, event.target.value)}
                        className="w-full h-9 px-3 border border-[var(--border)] bg-[var(--background)] text-[11px] font-mono text-[var(--foreground)]"
                      >
                        {visibleModels.map((model) => (
                          <option key={`${provider.providerId}-default-${model.id}`} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        className="h-9 px-3 text-[10px] font-mono uppercase border-[var(--border)]"
                        onClick={() => setSearchByProvider((prev) => ({ ...prev, [provider.providerId]: '' }))}
                        disabled={!searchByProvider[provider.providerId]}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto border border-[var(--border)] rounded-md">
                    {filteredModels.length === 0 ? (
                      <div className="px-3 py-4 text-[10px] font-mono text-[var(--muted-text)]">No models match this search.</div>
                    ) : (
                      filteredModels.map((model) => {
                        const isDefault = providerConfig.defaultModel === model.id;
                        const isVisible = providerConfig.visibleModels.length === 0 || providerConfig.visibleModels.includes(model.id) || isDefault;

                        return (
                          <div
                            key={`${provider.providerId}-${model.id}`}
                            className="px-3 py-2 border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-mono text-[var(--foreground)] truncate">{model.name}</div>
                              <div className="text-[10px] font-mono text-[var(--muted-text)] truncate">{model.id}</div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isDefault && (
                                <span className="text-[9px] px-2 py-1 border border-[var(--primary)] text-[var(--primary)] font-mono uppercase">
                                  Default
                                </span>
                              )}
                              <Button
                                variant="outline"
                                className="h-8 px-2 border-[var(--border)]"
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
      </div>
    </div>
  );
}
