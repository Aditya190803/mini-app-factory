'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@stackframe/stack';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logout } from '@/lib/logout';
import { Plug, User, CreditCard, Bell, KeyRound, ExternalLink, Eye, EyeOff, Copy, FlaskConical } from 'lucide-react';
import { AI_PROVIDER_IDS, type AIProviderId, type ProviderBYOKConfig, type ProviderCustomModelsConfig } from '@/lib/ai-admin-config';
import { setStoredBYOKConfig } from '@/lib/ai-admin-client';

type IntegrationStatus = {
  githubConnected: boolean;
  netlifyConnected: boolean;
  githubConnectedAt?: number;
  netlifyConnectedAt?: number;
};

const providerLabel: Record<AIProviderId, string> = {
  google: 'Google',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  cerebras: 'Cerebras',
};

const providerKeyUrl: Record<AIProviderId, string> = {
  google: 'https://aistudio.google.com/app/apikey',
  groq: 'https://console.groq.com/keys',
  openrouter: 'https://openrouter.ai/keys',
  cerebras: 'https://cloud.cerebras.ai/',
};

export default function SettingsPage() {
  const user = useUser();
  const router = useRouter();

  const [status, setStatus] = useState<IntegrationStatus>({
    githubConnected: false,
    netlifyConnected: false,
  });
  const [byokConfig, setByokConfig] = useState<ProviderBYOKConfig>({});
  const [customModelsConfig, setCustomModelsConfig] = useState<ProviderCustomModelsConfig>({});
  const [customModelInput, setCustomModelInput] = useState<Record<AIProviderId, string>>({
    google: '',
    groq: '',
    openrouter: '',
    cerebras: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showKey, setShowKey] = useState<Record<AIProviderId, boolean>>({
    google: false,
    groq: false,
    openrouter: false,
    cerebras: false,
  });
  const [saveState, setSaveState] = useState<Record<AIProviderId, 'idle' | 'saving' | 'saved' | 'error'>>({
    google: 'idle',
    groq: 'idle',
    openrouter: 'idle',
    cerebras: 'idle',
  });
  const [testState, setTestState] = useState<Record<AIProviderId, 'idle' | 'testing' | 'ok' | 'error'>>({
    google: 'idle',
    groq: 'idle',
    openrouter: 'idle',
    cerebras: 'idle',
  });
  const [testMessage, setTestMessage] = useState<Record<AIProviderId, string>>({
    google: '',
    groq: '',
    openrouter: '',
    cerebras: '',
  });

  const formatConnectedAt = (value?: number) => (value ? new Date(value).toLocaleString() : '—');

  useEffect(() => {
    if (!user) return;

    const loadInitial = async () => {
      try {
        const [integrationResp, aiSettingsResp, adminResp] = await Promise.all([
          fetch('/api/integrations/status'),
          fetch('/api/ai/settings'),
          fetch('/api/admin/status'),
        ]);

        if (integrationResp.ok) {
          const data = await integrationResp.json();
          setStatus({
            githubConnected: !!data.githubConnected,
            netlifyConnected: !!data.netlifyConnected,
            githubConnectedAt: data.githubConnectedAt,
            netlifyConnectedAt: data.netlifyConnectedAt,
          });
        }

        if (aiSettingsResp.ok) {
          const data = await aiSettingsResp.json();
          if (data.byokConfig && typeof data.byokConfig === 'object') {
            setByokConfig(data.byokConfig);
            setStoredBYOKConfig(data.byokConfig);
          }
          if (data.customModels && typeof data.customModels === 'object') {
            setCustomModelsConfig(data.customModels);
          }
        }

        if (adminResp.ok) {
          const data = await adminResp.json();
          setIsAdmin(!!data.isAdmin);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadInitial();
  }, [user]);

  const persistBYOK = async (providerId: AIProviderId, nextByokConfig: ProviderBYOKConfig) => {
    setSaveState((prev) => ({ ...prev, [providerId]: 'saving' }));
    setStoredBYOKConfig(nextByokConfig);
    try {
      await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byokConfig: nextByokConfig }),
      });
      setSaveState((prev) => ({ ...prev, [providerId]: 'saved' }));
      setTimeout(() => {
        setSaveState((prev) => (prev[providerId] === 'saved' ? { ...prev, [providerId]: 'idle' } : prev));
      }, 1200);
    } catch {
      setSaveState((prev) => ({ ...prev, [providerId]: 'error' }));
    }
  };

  const updateByok = (providerId: AIProviderId, value: string) => {
    setByokConfig((prev) => {
      const trimmed = value.trim();
      const next: ProviderBYOKConfig = { ...prev };
      if (trimmed.length > 0) {
        next[providerId] = trimmed;
      } else {
        delete next[providerId];
      }
      void persistBYOK(providerId, next);
      return next;
    });
  };

  const persistCustomModels = async (nextConfig: ProviderCustomModelsConfig) => {
    try {
      await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customModels: nextConfig }),
      });
    } catch {
      // Custom models saved locally, will sync on next load
    }
  };

  const addCustomModel = (providerId: AIProviderId) => {
    const candidate = customModelInput[providerId].trim();
    if (!candidate) return;

    setCustomModelsConfig((prev) => {
      const current = prev[providerId] ?? [];
      if (current.includes(candidate)) {
        return prev;
      }
      const next = {
        ...prev,
        [providerId]: [...current, candidate],
      };
      void persistCustomModels(next);
      return next;
    });

    setCustomModelInput((prev) => ({ ...prev, [providerId]: '' }));
  };

  const removeCustomModel = (providerId: AIProviderId, modelId: string) => {
    setCustomModelsConfig((prev) => {
      const current = prev[providerId] ?? [];
      const nextList = current.filter((entry) => entry !== modelId);
      const next: ProviderCustomModelsConfig = { ...prev };
      if (nextList.length > 0) {
        next[providerId] = nextList;
      } else {
        delete next[providerId];
      }
      void persistCustomModels(next);
      return next;
    });
  };

  const copyByok = async (providerId: AIProviderId) => {
    const key = byokConfig[providerId] || '';
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setTestState((prev) => ({ ...prev, [providerId]: 'ok' }));
      setTestMessage((prev) => ({ ...prev, [providerId]: 'Key copied to clipboard.' }));
    } catch {
      setTestState((prev) => ({ ...prev, [providerId]: 'error' }));
      setTestMessage((prev) => ({ ...prev, [providerId]: 'Copy failed.' }));
    }
  };

  const testByok = async (providerId: AIProviderId) => {
    const key = byokConfig[providerId] || '';
    if (!key) return;

    setTestState((prev) => ({ ...prev, [providerId]: 'testing' }));
    setTestMessage((prev) => ({ ...prev, [providerId]: '' }));

    try {
      const resp = await fetch('/api/ai/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, apiKey: key }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setTestState((prev) => ({ ...prev, [providerId]: 'error' }));
        setTestMessage((prev) => ({ ...prev, [providerId]: data.error || 'Key test failed.' }));
        return;
      }

      setTestState((prev) => ({ ...prev, [providerId]: 'ok' }));
      setTestMessage((prev) => ({ ...prev, [providerId]: data.message || 'Key is valid.' }));
    } catch {
      setTestState((prev) => ({ ...prev, [providerId]: 'error' }));
      setTestMessage((prev) => ({ ...prev, [providerId]: 'Unable to validate key.' }));
    }
  };

  const connectGithub = () => {
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent('/settings')}`;
  };

  const connectNetlify = () => {
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent('/settings')}`;
  };

  const disconnect = async (provider: 'github' | 'netlify' | 'all') => {
    setIsDisconnecting(provider);
    try {
      await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      setStatus((prev) => ({
        githubConnected: provider === 'github' || provider === 'all' ? false : prev.githubConnected,
        netlifyConnected: provider === 'netlify' || provider === 'all' ? false : prev.netlifyConnected,
        githubConnectedAt: provider === 'github' || provider === 'all' ? undefined : prev.githubConnectedAt,
        netlifyConnectedAt: provider === 'netlify' || provider === 'all' ? undefined : prev.netlifyConnectedAt,
      }));
    } finally {
      setIsDisconnecting(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="text-center">
          <h1 className="text-lg font-mono uppercase tracking-widest" style={{ color: 'var(--foreground)' }}>Sign in required</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--secondary-text)' }}>Please sign in to manage your settings.</p>
          <button
            onClick={() => router.push('/handler/sign-in')}
            className="mt-4 px-4 py-2 text-[10px] font-mono uppercase border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)]"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
          >
            ←
          </button>
          <div>
            <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>Settings</h1>
            <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
              Manage account, integrations, and keys
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--secondary-text)]">
                <User className="w-4 h-4" />
                <h2 className="text-xs font-mono uppercase tracking-widest">Account</h2>
              </div>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="text-[10px] font-mono uppercase border-[var(--border)]"
                  onClick={() => router.push('/admin')}
                >
                  Open Admin
                </Button>
              )}
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Signed in as <span className="text-[var(--foreground)]">{user.primaryEmail}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="text-[10px] font-mono uppercase border-[var(--border)]"
                onClick={() => logout(user, '/')}
              >
                Sign Out
              </Button>
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <Plug className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Integrations</h2>
            </div>
            {isLoading ? (
              <div className="text-[11px] font-mono text-[var(--muted-text)]">Loading integration status...</div>
            ) : (
              <div className="grid gap-4">
                <div className="border border-[var(--border)] rounded-md px-3 py-2">
                  <div className="text-[10px] font-mono uppercase text-[var(--secondary-text)] mb-2">Global Status</div>
                  <div className="grid md:grid-cols-2 gap-2 text-[10px] font-mono text-[var(--muted-text)]">
                    <div>
                      GitHub: {status.githubConnected ? 'Connected' : 'Not connected'}
                      <div className="text-[9px] text-[var(--secondary-text)]">Last connected: {formatConnectedAt(status.githubConnectedAt)}</div>
                    </div>
                    <div>
                      Netlify: {status.netlifyConnected ? 'Connected' : 'Not connected'}
                      <div className="text-[9px] text-[var(--secondary-text)]">Last connected: {formatConnectedAt(status.netlifyConnectedAt)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">GitHub</div>
                    <div className="text-[11px] text-[var(--muted-text)]">{status.githubConnected ? 'Connected' : 'Not connected'}</div>
                    <div className="text-[9px] text-[var(--secondary-text)]">Last connected: {formatConnectedAt(status.githubConnectedAt)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={connectGithub} variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]">
                      {status.githubConnected ? 'Reconnect' : 'Connect'}
                    </Button>
                    {status.githubConnected && (
                      <Button
                        onClick={() => disconnect('github')}
                        variant="outline"
                        className="font-mono uppercase text-[10px] border-[var(--border)]"
                        disabled={isDisconnecting === 'github'}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">Netlify</div>
                    <div className="text-[11px] text-[var(--muted-text)]">{status.netlifyConnected ? 'Connected' : 'Not connected'}</div>
                    <div className="text-[9px] text-[var(--secondary-text)]">Last connected: {formatConnectedAt(status.netlifyConnectedAt)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={connectNetlify} variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]">
                      {status.netlifyConnected ? 'Reconnect' : 'Connect'}
                    </Button>
                    {status.netlifyConnected && (
                      <Button
                        onClick={() => disconnect('netlify')}
                        variant="outline"
                        className="font-mono uppercase text-[10px] border-[var(--border)]"
                        disabled={isDisconnecting === 'netlify'}
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <KeyRound className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">AI BYOK</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Use your own keys per provider when signed in. Keys are saved to your account and applied automatically.
            </div>

            <div className="grid gap-3">
              {AI_PROVIDER_IDS.map((providerId) => (
                <div key={`byok-${providerId}`} className="border border-[var(--border)] rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]">
                      <span className="w-5 h-5 border border-[var(--border)] rounded-full inline-flex items-center justify-center text-[9px] text-[var(--foreground)]">
                        {providerLabel[providerId].slice(0, 1)}
                      </span>
                      {providerLabel[providerId]}
                    </div>
                    <a
                      href={providerKeyUrl[providerId]}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-[var(--primary)] hover:underline"
                    >
                      Get API Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showKey[providerId] ? 'text' : 'password'}
                      value={byokConfig[providerId] || ''}
                      onChange={(event) => updateByok(providerId, event.target.value)}
                      className="text-[11px] font-mono"
                      placeholder={`Paste ${providerLabel[providerId]} key`}
                    />
                    <Button
                      variant="outline"
                      type="button"
                      className="text-[10px] font-mono uppercase border-[var(--border)]"
                      onClick={() => setShowKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }))}
                    >
                      {showKey[providerId] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className="text-[10px] font-mono uppercase border-[var(--border)]"
                      onClick={() => copyByok(providerId)}
                      disabled={!byokConfig[providerId]}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className="text-[10px] font-mono uppercase border-[var(--border)]"
                      onClick={() => testByok(providerId)}
                      disabled={!byokConfig[providerId] || testState[providerId] === 'testing'}
                    >
                      <FlaskConical className="w-3 h-3" />
                    </Button>
                  </div>
                  <div
                    className="text-[10px] font-mono uppercase"
                    style={{
                      color:
                        saveState[providerId] === 'error'
                          ? 'var(--error)'
                          : saveState[providerId] === 'saved'
                            ? 'var(--foreground)'
                            : 'var(--secondary-text)',
                    }}
                  >
                    {saveState[providerId] === 'saving' && 'Saving...'}
                    {saveState[providerId] === 'saved' && 'Saved'}
                    {saveState[providerId] === 'error' && 'Save failed (local cache kept)'}
                  </div>
                  {testState[providerId] !== 'idle' && testMessage[providerId] && (
                    <div
                      className="text-[10px] font-mono"
                      style={{
                        color:
                          testState[providerId] === 'error'
                            ? 'var(--error)'
                            : testState[providerId] === 'ok'
                              ? 'var(--foreground)'
                              : 'var(--secondary-text)',
                      }}
                    >
                      {testMessage[providerId]}
                    </div>
                  )}

                  <div className="border border-[var(--border)] rounded-md p-2 space-y-2">
                    <div className="text-[10px] font-mono uppercase text-[var(--secondary-text)]">Custom model IDs</div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={customModelInput[providerId]}
                        onChange={(event) => setCustomModelInput((prev) => ({ ...prev, [providerId]: event.target.value }))}
                        className="text-[11px] font-mono"
                        placeholder={`Add ${providerLabel[providerId]} model id`}
                      />
                      <Button
                        variant="outline"
                        type="button"
                        className="text-[10px] font-mono uppercase border-[var(--border)]"
                        onClick={() => addCustomModel(providerId)}
                      >
                        Add
                      </Button>
                    </div>
                    {(customModelsConfig[providerId] ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {(customModelsConfig[providerId] ?? []).map((modelId) => (
                          <button
                            key={`${providerId}-custom-${modelId}`}
                            type="button"
                            onClick={() => removeCustomModel(providerId, modelId)}
                            className="px-2 py-1 border border-[var(--border)] text-[10px] font-mono text-[var(--muted-text)] hover:text-[var(--foreground)]"
                          >
                            {modelId} ×
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-[var(--muted-text)]">No custom models added.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <Bell className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Notifications</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">Notification preferences are coming soon.</div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <CreditCard className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Billing</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">Billing settings will appear here when plans are enabled.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
