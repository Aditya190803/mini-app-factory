'use client';

import { useState } from 'react';
import { Check, Cloud, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Account = { id: string; name: string };

type Props = {
  connected: boolean;
  accountName?: string;
  onConnected?: (account: Account) => void;
};

export default function CloudflareConnect({ connected, accountName, onConnected }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const authorize = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/api/integrations/cloudflare/start?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const loadAccounts = async () => {
    setState('loading');
    setError('');
    try {
      const response = await fetch('/api/integrations/cloudflare/accounts');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load Cloudflare accounts');
      setAccounts(data.accounts || []);
      setState('idle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Cloudflare accounts');
      setState('error');
    }
  };

  const selectAccount = async (accountId: string) => {
    setState('saving');
    setError('');
    try {
      const response = await fetch('/api/integrations/cloudflare/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to change Cloudflare account');
      setAccounts([]);
      setState('idle');
      onConnected?.(data.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change Cloudflare account');
      setState('error');
    }
  };

  if (connected) {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-400/10 text-orange-400"><Cloud className="size-4" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium"><Check className="size-3.5 text-emerald-400" /> Cloudflare connected</div>
              <div className="truncate text-xs text-[var(--muted-text)]">{accountName || 'Authorized account'}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="text-xs" disabled={state === 'loading'} onClick={() => void loadAccounts()}>{state === 'loading' ? 'Loading…' : 'Change account'}</Button>
            <Button type="button" variant="outline" className="text-xs" onClick={authorize}>Reauthorize</Button>
          </div>
        </div>
        {accounts.length > 0 ? <div className="grid gap-1 rounded-lg border border-[var(--border)] p-1.5">{accounts.map((account) => <button key={account.id} type="button" disabled={state === 'saving'} onClick={() => void selectAccount(account.id)} className="rounded-md px-3 py-2 text-left text-xs text-[var(--secondary-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] disabled:opacity-50">{account.name}</button>)}</div> : null}
        {error ? <div role="alert" className="text-xs text-red-400">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs leading-5 text-[var(--muted-text)]">Authorize Mini App Factory in Cloudflare. You will choose the account and review every requested permission before access is granted.</p>
      <Button type="button" onClick={authorize} className="w-fit gap-2 bg-orange-500 text-white hover:bg-orange-500/90"><Cloud className="size-4" /> Connect Cloudflare <ExternalLink className="size-3.5" /></Button>
      {error ? <div role="alert" className="text-xs text-red-400">{error}</div> : null}
    </div>
  );
}
