'use client';

import { useEffect, useState } from "react";
import { useUser } from "@stackframe/stack";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/logout";
import { Shield, Plug, User, CreditCard, Bell } from "lucide-react";

type IntegrationStatus = {
  githubConnected: boolean;
  netlifyConnected: boolean;
  githubConnectedAt?: number;
  netlifyConnectedAt?: number;
};

export default function SettingsPage() {
  const user = useUser();
  const router = useRouter();
  const [status, setStatus] = useState<IntegrationStatus>({
    githubConnected: false,
    netlifyConnected: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const formatConnectedAt = (value?: number) => (value ? new Date(value).toLocaleString() : '—');

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const resp = await fetch('/api/integrations/status');
        if (!resp.ok) {
          setStatus({ githubConnected: false, netlifyConnected: false });
          return;
        }
        const data = await resp.json();
        setStatus({
          githubConnected: !!data.githubConnected,
          netlifyConnected: !!data.netlifyConnected,
          githubConnectedAt: data.githubConnectedAt,
          netlifyConnectedAt: data.netlifyConnectedAt,
        });
      } finally {
        setIsLoading(false);
      }
    };
    loadStatus();
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="text-center">
          <h1 className="text-lg font-mono uppercase tracking-widest" style={{ color: 'var(--foreground)' }}>
            Sign in required
          </h1>
          <p className="text-xs mt-2" style={{ color: 'var(--secondary-text)' }}>
            Please sign in to manage your settings.
          </p>
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

  const connectGithub = () => {
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent('/settings')}`;
  };

  const connectNetlify = () => {
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent('/settings')}`;
  };

  const disconnect = async (provider: "github" | "netlify" | "all") => {
    setIsDisconnecting(provider);
    try {
      await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      setStatus((prev) => ({
        githubConnected: provider === "github" || provider === "all" ? false : prev.githubConnected,
        netlifyConnected: provider === "netlify" || provider === "all" ? false : prev.netlifyConnected,
        githubConnectedAt: provider === "github" || provider === "all" ? undefined : prev.githubConnectedAt,
        netlifyConnectedAt: provider === "netlify" || provider === "all" ? undefined : prev.netlifyConnectedAt,
      }));
    } finally {
      setIsDisconnecting(null);
    }
  };

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
            <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
              Settings
            </h1>
            <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
              Manage account, integrations, and preferences
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <User className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Account</h2>
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
                  <div className="text-[10px] font-mono uppercase text-[var(--secondary-text)] mb-2">
                    Global Status
                  </div>
                  <div className="grid md:grid-cols-2 gap-2 text-[10px] font-mono text-[var(--muted-text)]">
                    <div>
                      GitHub: {status.githubConnected ? 'Connected' : 'Not connected'}
                      <div className="text-[9px] text-[var(--secondary-text)]">
                        Last connected: {formatConnectedAt(status.githubConnectedAt)}
                      </div>
                    </div>
                    <div>
                      Netlify: {status.netlifyConnected ? 'Connected' : 'Not connected'}
                      <div className="text-[9px] text-[var(--secondary-text)]">
                        Last connected: {formatConnectedAt(status.netlifyConnectedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">GitHub</div>
                    <div className="text-[11px] text-[var(--muted-text)]">
                      {status.githubConnected ? 'Connected' : 'Not connected'}
                    </div>
                    <div className="text-[9px] text-[var(--secondary-text)]">
                      Last connected: {formatConnectedAt(status.githubConnectedAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={connectGithub}
                      variant="outline"
                      className="font-mono uppercase text-[10px] border-[var(--border)]"
                    >
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
                    <div className="text-[11px] text-[var(--muted-text)]">
                      {status.netlifyConnected ? 'Connected' : 'Not connected'}
                    </div>
                    <div className="text-[9px] text-[var(--secondary-text)]">
                      Last connected: {formatConnectedAt(status.netlifyConnectedAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={connectNetlify}
                      variant="outline"
                      className="font-mono uppercase text-[10px] border-[var(--border)]"
                    >
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

                <div className="flex items-center justify-between border border-dashed border-[var(--border)] rounded-md px-3 py-2">
                  <div className="text-[11px] font-mono text-[var(--muted-text)]">
                    Disconnect all integrations at once.
                  </div>
                  <Button
                    onClick={() => disconnect('all')}
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    disabled={isDisconnecting === 'all'}
                  >
                    Disconnect All
                  </Button>
                </div>

                <div className="text-[11px] font-mono text-[var(--muted-text)]">
                  Need help connecting OAuth apps? See the setup guide in the docs.
                  <button
                    onClick={() => router.push('/docs#deploy')}
                    className="ml-2 text-[var(--primary)] uppercase text-[10px] font-bold"
                  >
                    Open Docs
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <Shield className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Security</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Manage security-related settings for your account.
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Two-factor authentication and API key management are coming soon.
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <Bell className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Notifications</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Notification preferences are coming soon.
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--secondary-text)]">
              <CreditCard className="w-4 h-4" />
              <h2 className="text-xs font-mono uppercase tracking-widest">Billing</h2>
            </div>
            <div className="text-[11px] font-mono text-[var(--muted-text)]">
              Billing settings will appear here when plans are enabled.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
