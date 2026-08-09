'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Account = { id: string; name: string };

type Props = {
  connected: boolean;
  accountName?: string;
  onConnected?: (account: Account) => void;
};

export default function CloudflareConnect({ connected, accountName, onConnected }: Props) {
  const [editing, setEditing] = useState(!connected);
  const [token, setToken] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const connect = async () => {
    if (!token.trim()) return;
    setState('saving');
    setError('');
    try {
      const response = await fetch('/api/integrations/cloudflare/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), ...(accountId ? { accountId } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Cloudflare connection failed');
      if (data.requiresAccount && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
        setAccountId(data.accounts[0]?.id ?? '');
        setState('idle');
        return;
      }
      setToken('');
      setAccounts([]);
      setEditing(false);
      setState('idle');
      onConnected?.(data.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cloudflare connection failed');
      setState('error');
    }
  };

  if (connected && !editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">Cloudflare</div>
          <div className="text-[11px] text-[var(--muted-text)]">Connected{accountName ? ` · ${accountName}` : ''}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="font-mono uppercase text-[10px] border-[var(--border)]"
          onClick={() => setEditing(true)}
        >
          Reconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="text-[10px] font-mono text-[var(--muted-text)]">
        Create a scoped token with <strong>Cloudflare Pages: Edit</strong>. Add D1, Workers KV, R2, Queues,
        Vectorize, Browser Rendering, and Zone DNS edit permissions only when the project uses them.
      </div>
      <a
        href="https://dash.cloudflare.com/profile/api-tokens"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-[var(--primary)] hover:underline"
      >
        Create API token <ExternalLink className="w-3 h-3" />
      </a>
      <Input
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Paste Cloudflare API token"
        aria-label="Cloudflare API token"
        autoComplete="off"
        className="text-xs font-mono"
      />
      {accounts.length > 1 && (
        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          aria-label="Cloudflare account"
          className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        >
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      )}
      {error && <div role="alert" className="text-[10px] font-mono text-red-500">{error}</div>}
      <div className="flex gap-2">
        {connected && (
          <Button type="button" variant="ghost" className="font-mono uppercase text-[10px]" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="font-mono uppercase text-[10px] border-[var(--border)]"
          disabled={!token.trim() || state === 'saving'}
          onClick={connect}
        >
          {state === 'saving' ? 'Connecting…' : accounts.length > 1 ? 'Use Account' : 'Verify & Connect'}
        </Button>
      </div>
    </div>
  );
}
