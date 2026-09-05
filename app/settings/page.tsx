'use client';

import { toast } from 'sonner';

import { useEffect, useState } from 'react';
import { useUser } from '@stackframe/stack';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Row,
  RowList,
  Section,
  Skeleton,
  StatusDot,
} from '@/components/kit';
import { TopBar } from '@/components/shell/top-bar';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { AccountMenu } from '@/components/shell/account-menu';
import { logout } from '@/lib/logout';
import { ExternalLink, Eye, EyeOff, FlaskConical, KeyRound, Trash2 } from 'lucide-react';
import { AI_PROVIDER_IDS, type AIProviderId, type ProviderCustomModelsConfig } from '@/lib/ai-admin-config';
import { purgeLegacyStoredBYOK } from '@/lib/ai-admin-client';
import CloudflareConnect from '@/components/cloudflare-connect';

type IntegrationStatus = {
  githubConnected: boolean;
  netlifyConnected: boolean;
  cloudflareConnected: boolean;
  githubConnectedAt?: number;
  netlifyConnectedAt?: number;
  cloudflareConnectedAt?: number;
  cloudflareAccountName?: string;
};

const providerLabel: Record<AIProviderId, string> = {
  opencode: 'OpenCode Zen',
  openrouter: 'OpenRouter',
};

const providerKeyUrl: Record<AIProviderId, string> = {
  opencode: 'https://opencode.ai/zen',
  openrouter: 'https://openrouter.ai/keys',
};

export default function SettingsPage() {
  const user = useUser();
  const router = useRouter();

  const [status, setStatus] = useState<IntegrationStatus>({
    githubConnected: false,
    netlifyConnected: false,
    cloudflareConnected: false,
  });
  // Saved keys never come back from the server — we only learn which providers have one.
  // `byokDraft` holds what the user is currently typing, and is cleared once saved.
  const [byokStatus, setByokStatus] = useState<Record<string, boolean>>({});
  const [byokDraft, setByokDraft] = useState<Record<string, string>>({});
  const [customModelsConfig, setCustomModelsConfig] = useState<ProviderCustomModelsConfig>({});
  const [customModelInput, setCustomModelInput] = useState<Record<AIProviderId, string>>({
    opencode: '',
    openrouter: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showKey, setShowKey] = useState<Record<AIProviderId, boolean>>({
    opencode: false,
    openrouter: false,
  });
  const [saveState, setSaveState] = useState<Record<AIProviderId, 'idle' | 'saving' | 'saved' | 'error'>>({
    opencode: 'idle',
    openrouter: 'idle',
  });
  const [testState, setTestState] = useState<Record<AIProviderId, 'idle' | 'testing' | 'ok' | 'error'>>({
    opencode: 'idle',
    openrouter: 'idle',
  });
  const [testMessage, setTestMessage] = useState<Record<AIProviderId, string>>({
    opencode: '',
    openrouter: '',
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
            cloudflareConnected: !!data.cloudflareConnected,
            githubConnectedAt: data.githubConnectedAt,
            netlifyConnectedAt: data.netlifyConnectedAt,
            cloudflareConnectedAt: data.cloudflareConnectedAt,
            cloudflareAccountName: data.cloudflareAccountName,
          });
        }

        if (aiSettingsResp.ok) {
          const data = await aiSettingsResp.json();
          if (data.byokStatus && typeof data.byokStatus === 'object') {
            setByokStatus(data.byokStatus);
          }
          // Drop any keys left in localStorage by an older build.
          purgeLegacyStoredBYOK();
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

  /** Send only the provider that changed. An empty string clears it server-side. */
  const persistBYOK = async (providerId: AIProviderId, key: string) => {
    setSaveState((prev) => ({ ...prev, [providerId]: 'saving' }));
    try {
      const resp = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byokConfig: { [providerId]: key } }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save API key');
      }
      if (data.byokStatus && typeof data.byokStatus === 'object') {
        setByokStatus(data.byokStatus);
      }
      // The key is saved; stop holding it in component state.
      setByokDraft((prev) => ({ ...prev, [providerId]: '' }));
      setSaveState((prev) => ({ ...prev, [providerId]: 'saved' }));
      setTimeout(() => {
        setSaveState((prev) => (prev[providerId] === 'saved' ? { ...prev, [providerId]: 'idle' } : prev));
      }, 1200);
    } catch {
      setSaveState((prev) => ({ ...prev, [providerId]: 'error' }));
    }
  };

  const updateByokDraft = (providerId: AIProviderId, value: string) => {
    setByokDraft((prev) => ({ ...prev, [providerId]: value }));
  };

  const saveByok = (providerId: AIProviderId) => {
    const trimmed = (byokDraft[providerId] || '').trim();
    if (!trimmed) return;
    void persistBYOK(providerId, trimmed);
  };

  const clearByok = (providerId: AIProviderId) => {
    setByokDraft((prev) => ({ ...prev, [providerId]: '' }));
    void persistBYOK(providerId, '');
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

  const addCustomModelId = (providerId: AIProviderId, candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;

    setCustomModelsConfig((prev) => {
      const current = prev[providerId] ?? [];
      if (current.includes(trimmed)) {
        return prev;
      }
      const next = {
        ...prev,
        [providerId]: [...current, trimmed],
      };
      void persistCustomModels(next);
      return next;
    });
  };

  const addCustomModel = (providerId: AIProviderId) => {
    addCustomModelId(providerId, customModelInput[providerId]);
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

  // "Copy key to clipboard" was removed along with the server echoing saved keys back. The key
  // exists only on the server now, which is the point.

  const testByok = async (providerId: AIProviderId) => {
    const draft = (byokDraft[providerId] || '').trim();
    const hasSaved = byokStatus[providerId];
    if (!draft && !hasSaved) return;

    setTestState((prev) => ({ ...prev, [providerId]: 'testing' }));
    setTestMessage((prev) => ({ ...prev, [providerId]: '' }));

    try {
      // Test what the user typed if they typed something; otherwise ask the server to test the
      // key it already holds, since we cannot see it.
      const resp = await fetch('/api/ai/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft ? { providerId, apiKey: draft } : { providerId, useStored: true }),
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

  const disconnect = async (provider: 'github' | 'netlify' | 'cloudflare' | 'all') => {
    setIsDisconnecting(provider);
    try {
      const resp = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!resp.ok) {
        toast.error('Could not disconnect. Try again.');
        return;
      }
      setStatus((prev) => ({
        githubConnected: provider === 'github' || provider === 'all' ? false : prev.githubConnected,
        netlifyConnected: provider === 'netlify' || provider === 'all' ? false : prev.netlifyConnected,
        cloudflareConnected: provider === 'cloudflare' || provider === 'all' ? false : prev.cloudflareConnected,
        githubConnectedAt: provider === 'github' || provider === 'all' ? undefined : prev.githubConnectedAt,
        netlifyConnectedAt: provider === 'netlify' || provider === 'all' ? undefined : prev.netlifyConnectedAt,
        cloudflareConnectedAt: provider === 'cloudflare' || provider === 'all' ? undefined : prev.cloudflareConnectedAt,
        cloudflareAccountName: provider === 'cloudflare' || provider === 'all' ? undefined : prev.cloudflareAccountName,
      }));
    } finally {
      setIsDisconnecting(null);
    }
  };

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <h1 className="text-lg font-medium">Sign in to manage settings</h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            Connections and keys belong to your account.
          </p>
          <Button intent="primary" className="mt-5" onClick={() => router.push('/handler/sign-in')}>
            Sign in
          </Button>
        </div>
      </div>
    );
  }


  const connections = [
    {
      id: 'cloudflare' as const,
      label: 'Cloudflare',
      detail: 'Publishes your projects to Pages and Workers in your own account.',
      connected: status.cloudflareConnected,
      at: status.cloudflareConnectedAt,
      extra: status.cloudflareAccountName,
      primary: true,
    },
    {
      id: 'github' as const,
      label: 'GitHub',
      detail: 'Mirrors the project bundle to a repository you own. Hosts nothing itself.',
      connected: status.githubConnected,
      at: status.githubConnectedAt,
    },
    {
      id: 'netlify' as const,
      label: 'Netlify',
      detail: 'Hosts static output through a GitHub repository. Cannot run a Worker.',
      connected: status.netlifyConnected,
      at: status.netlifyConnectedAt,
    },
  ];

  const anyConnected = connections.some((connection) => connection.connected);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar crumbs={[{ label: 'Settings' }]}>
        <ThemeToggle className="mr-1 hidden sm:inline-flex" />
        <AccountMenu />
      </TopBar>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="ticked pb-3">
          <h1 className="text-2xl font-medium tracking-[-0.024em]">Settings</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Signed in as {user.primaryEmail ?? 'your account'}
          </p>
        </div>

        <div className="mt-10 space-y-12">
          <Section
            title="Cloudflare"
            description="The account every deploy lands in. Nothing is created there without you approving the exact list of resources first."
          >
            <div className="rounded-lg border border-[var(--rule)] bg-[var(--surface-1)] p-4">
              <CloudflareConnect
                connected={status.cloudflareConnected}
                accountName={status.cloudflareAccountName}
                onConnected={(account) =>
                  setStatus((prev) => ({
                    ...prev,
                    cloudflareConnected: true,
                    cloudflareAccountName: account?.name,
                  }))
                }
              />
            </div>
          </Section>

          <Section
            title="Connected accounts"
            description="Each one stores an encrypted token so deploys can run on your behalf. Disconnecting deletes the token immediately."
            actions={
              anyConnected && (
                <Button
                  intent="danger"
                  size="sm"
                  busy={isDisconnecting === 'all'}
                  onClick={() => void disconnect('all')}
                >
                  Disconnect all
                </Button>
              )
            }
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <RowList>
                {connections.map((connection) => (
                  <Row key={connection.id} className="items-start">
                    <StatusDot
                      tone={connection.connected ? 'live' : 'pending'}
                      label={connection.connected ? 'Connected' : 'Not connected'}
                      className="mt-1.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{connection.label}</p>
                        {connection.primary && (
                          <Badge tone="signal" mono>
                            primary
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
                        {connection.detail}
                      </p>
                      {connection.connected && (
                        <p className="tabular mt-1 text-xs text-[var(--muted-foreground)]">
                          {connection.extra ? `${connection.extra}, connected ` : 'Connected '}
                          {formatConnectedAt(connection.at)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {connection.connected ? (
                        <Button
                          size="sm"
                          busy={isDisconnecting === connection.id}
                          onClick={() => void disconnect(connection.id)}
                        >
                          Disconnect
                        </Button>
                      ) : connection.id === 'github' ? (
                        <Button size="sm" onClick={connectGithub}>
                          Connect
                        </Button>
                      ) : connection.id === 'netlify' ? (
                        <Button size="sm" onClick={connectNetlify}>
                          Connect
                        </Button>
                      ) : null}
                    </div>
                  </Row>
                ))}
              </RowList>
            )}
          </Section>

          <Section
            title="Your own API keys"
            description="Optional. A key here is used instead of the shared one for that provider. Keys are stored encrypted and are never sent back to this page, which is why a saved key shows as present rather than as text."
          >
            <div className="space-y-6">
              {AI_PROVIDER_IDS.map((providerId) => {
                const saved = Boolean(byokStatus[providerId]);
                const draft = byokDraft[providerId] || '';
                const models = customModelsConfig[providerId] ?? [];
                const test = testState[providerId];

                return (
                  <div
                    key={providerId}
                    className="rounded-lg border border-[var(--rule)] bg-[var(--surface-1)] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">{providerLabel[providerId]}</h3>
                        {saved ? (
                          <Badge tone="live">key saved</Badge>
                        ) : (
                          <Badge tone="neutral">using the shared key</Badge>
                        )}
                      </div>
                      <a
                        href={providerKeyUrl[providerId]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--signal-text)] underline underline-offset-2"
                      >
                        Get a key
                        <ExternalLink className="size-3" />
                      </a>
                    </div>

                    <div className="mt-3">
                      <Field
                        label="API key"
                        hideLabel
                        error={
                          test === 'error' ? testMessage[providerId] || 'That key was rejected.' : undefined
                        }
                        hint={
                          test === 'ok'
                            ? testMessage[providerId] || 'The key works.'
                            : saved && !draft
                              ? 'A key is stored. Type a new one to replace it.'
                              : undefined
                        }
                      >
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showKey[providerId] ? 'text' : 'password'}
                              value={draft}
                              autoComplete="off"
                              placeholder={saved ? 'Stored. Type to replace.' : 'Paste your key'}
                              onChange={(event) => updateByokDraft(providerId, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') saveByok(providerId);
                              }}
                              className="pr-9 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
                              }
                              aria-label={showKey[providerId] ? 'Hide the key' : 'Show the key'}
                              className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                            >
                              {showKey[providerId] ? (
                                <EyeOff className="size-3.5" />
                              ) : (
                                <Eye className="size-3.5" />
                              )}
                            </button>
                          </div>

                          <Button
                            intent="primary"
                            disabled={!draft.trim()}
                            busy={saveState[providerId] === 'saving'}
                            onClick={() => saveByok(providerId)}
                          >
                            {saveState[providerId] === 'saved' ? 'Saved' : 'Save'}
                          </Button>
                          <Button
                            disabled={!draft.trim() && !saved}
                            busy={test === 'testing'}
                            onClick={() => void testByok(providerId)}
                          >
                            <FlaskConical className="size-3.5" />
                            Test
                          </Button>
                          {saved && (
                            <IconButton
                              label={`Remove the stored ${providerLabel[providerId]} key`}
                              intent="danger"
                              onClick={() => clearByok(providerId)}
                            >
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          )}
                        </div>
                      </Field>
                    </div>

                    {isAdmin && (
                      <div className="mt-4 border-t border-[var(--rule)] pt-3">
                        <p className="key">Extra model ids</p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                          Model ids added here appear in the picker alongside the ones fetched from
                          the provider.
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={customModelInput[providerId]}
                            placeholder="provider/model-id"
                            className="font-mono"
                            onChange={(event) =>
                              setCustomModelInput((prev) => ({
                                ...prev,
                                [providerId]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                addCustomModel(providerId);
                              }
                            }}
                          />
                          <Button
                            disabled={!customModelInput[providerId].trim()}
                            onClick={() => addCustomModel(providerId)}
                          >
                            Add
                          </Button>
                        </div>
                        {models.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {models.map((modelId) => (
                              <li
                                key={modelId}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--rule)] py-0.5 pl-2 pr-0.5 font-mono text-xs"
                              >
                                {modelId}
                                <IconButton
                                  label={`Remove ${modelId}`}
                                  size="sm"
                                  intent="danger"
                                  onClick={() => removeCustomModel(providerId, modelId)}
                                >
                                  <Trash2 className="size-3" />
                                </IconButton>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {isAdmin && (
            <Section
              title="Administration"
              description="Provider defaults and the global model configuration, for this deployment as a whole."
            >
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/admin">
                    <KeyRound className="size-3.5" />
                    AI console
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/admin/models">Model management</Link>
                </Button>
              </div>
            </Section>
          )}

          <Section
            title="Account"
            description="Signing out clears this session on this device only."
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-sm">{user.primaryEmail ?? 'Signed in'}</p>
              <Button
                onClick={() => {
                  void logout(user, '/');
                }}
              >
                Sign out
              </Button>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
