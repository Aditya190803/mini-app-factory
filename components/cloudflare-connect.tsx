'use client'

import * as React from 'react'
import { Cloud, ExternalLink } from 'lucide-react'
import { Button, Callout, StatusDot } from '@/components/kit'

type Account = { id: string; name: string }

type Props = {
  connected: boolean
  accountName?: string
  onConnected?: (account: Account) => void
}

/**
 * The Cloudflare connection.
 *
 * This is the one integration the product genuinely depends on, so it says
 * plainly what authorizing does and which account the deploy will land in.
 * Changing account is a separate, deliberate step rather than a dropdown that
 * silently retargets a deploy already being set up.
 */
export default function CloudflareConnect({ connected, accountName, onConnected }: Props) {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [state, setState] = React.useState<'idle' | 'loading' | 'saving'>('idle')
  const [error, setError] = React.useState('')

  const authorize = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(
      `/api/integrations/cloudflare/start?returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  const loadAccounts = async () => {
    setState('loading')
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudflare/accounts')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not load your Cloudflare accounts')
      setAccounts(data.accounts || [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your Cloudflare accounts')
    } finally {
      setState('idle')
    }
  }

  const selectAccount = async (accountId: string) => {
    setState('saving')
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudflare/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Could not switch Cloudflare account')
      setAccounts([])
      onConnected?.(data.account)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not switch Cloudflare account')
    } finally {
      setState('idle')
    }
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--rule)] bg-[var(--surface-2)] text-[var(--signal-text)]">
            <Cloud className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Cloudflare is not connected</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
              You pick the account and review every permission on Cloudflare&apos;s own screen.
              Nothing is created until you approve the resource list here afterwards.
            </p>
          </div>
        </div>
        <Button intent="primary" size="sm" onClick={authorize}>
          <Cloud className="size-3.5" />
          Connect Cloudflare
          <ExternalLink className="size-3" />
        </Button>
        {error && <Callout tone="failed">{error}</Callout>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <StatusDot tone="live" label="Connected" />
            Cloudflare connected
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            Deploying into {accountName || 'the authorized account'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" busy={state === 'loading'} onClick={() => void loadAccounts()}>
            Change account
          </Button>
          <Button size="sm" onClick={authorize}>
            Reauthorize
          </Button>
        </div>
      </div>

      {accounts.length > 0 && (
        <ul className="divide-y divide-[var(--rule)] overflow-hidden rounded-md border border-[var(--rule)]">
          {accounts.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                disabled={state === 'saving'}
                onClick={() => void selectAccount(account.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                <span className="truncate">{account.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                  {account.id.slice(0, 8)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <Callout tone="failed">{error}</Callout>}
    </div>
  )
}
