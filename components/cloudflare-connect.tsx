'use client'

import { readApiResponse } from '@/lib/api-fetch'
import * as React from 'react'
import { Cloud, ExternalLink } from 'lucide-react'
import { Button, Callout, Field, Input, StatusDot } from '@/components/kit'

type Account = { id: string; name: string }

type Props = {
  connected: boolean
  accountName?: string
  oauthConfigured?: boolean
  onConnected?: (account: Account) => void
}

export default function CloudflareConnect({
  connected,
  accountName,
  oauthConfigured = false,
  onConnected,
}: Props) {
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [state, setState] = React.useState<'idle' | 'loading' | 'saving'>('idle')
  const [error, setError] = React.useState('')
  const [token, setToken] = React.useState('')

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const flagged = params.get('cloudflareError')
    if (flagged === 'oauth-unconfigured') {
      setError('OAuth is not set up on this deployment. Paste an API token below, or add CLOUDFLARE_CLIENT_ID and CLOUDFLARE_CLIENT_SECRET.')
    } else if (flagged) {
      setError(flagged)
    }
  }, [])

  const authorize = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(
      `/api/integrations/cloudflare/start?returnTo=${encodeURIComponent(returnTo)}`
    )
  }

  const saveToken = async () => {
    const value = token.trim()
    if (!value) {
      setError('Paste a Cloudflare API token')
      return
    }
    setState('saving')
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudflare/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      })
      const data = await readApiResponse(response, 'Could not save that token');
      setToken('')
      onConnected?.(data.account)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that token')
    } finally {
      setState('idle')
    }
  }

  const loadAccounts = async () => {
    setState('loading')
    setError('')
    try {
      const response = await fetch('/api/integrations/cloudflare/accounts')
      const data = await readApiResponse(response, 'Could not load your Cloudflare accounts');
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
      const data = await readApiResponse(response, 'Could not switch Cloudflare account');
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
              {oauthConfigured
                ? 'Authorize on Cloudflare, or paste an API token from dash.cloudflare.com/profile/api-tokens.'
                : 'Paste an API token from dash.cloudflare.com/profile/api-tokens. OAuth needs CLOUDFLARE_CLIENT_ID and CLOUDFLARE_CLIENT_SECRET on the server.'}
            </p>
          </div>
        </div>
        {oauthConfigured && (
          <Button intent="primary" size="sm" onClick={authorize}>
            <Cloud className="size-3.5" />
            Connect Cloudflare
            <ExternalLink className="size-3" />
          </Button>
        )}
        <Field label="API token">
          <div className="flex flex-wrap gap-2">
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Cloudflare API token"
              className="min-w-0 flex-1"
            />
            <Button size="sm" busy={state === 'saving'} onClick={() => void saveToken()}>
              Save token
            </Button>
          </div>
        </Field>
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
          {oauthConfigured && (
            <Button size="sm" onClick={authorize}>
              Reauthorize
            </Button>
          )}
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
