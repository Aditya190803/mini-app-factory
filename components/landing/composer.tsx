'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import { ArrowUp, Link2, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton, Kbd, Callout, PlateFrame } from '@/components/kit'
import { ModelPicker } from '@/components/shell/model-picker'
import { getStoredSelectedModel, setStoredSelectedModel, withAIAdminHeaders } from '@/lib/ai-admin-client'
import { isHttpUrl } from '@/lib/url-reference'
import { COMPOSER_STARTERS, EDGE_TEMPLATES } from '@/lib/constants'

const DRAFT_KEY = 'maf:composer-draft'

/**
 * The composer.
 *
 * Static vs edge is not a user choice here. The model picks from the prompt,
 * and the editor badge reflects whatever files actually got written. That is
 * already how `inferTarget` works after generation.
 *
 * The draft survives a trip through sign-in. Writing what someone typed into
 * session storage and restoring it is the difference between signing in and
 * starting over.
 */
export function Composer({ className }: { className?: string }) {
  const router = useRouter()
  const user = useUser()

  const [prompt, setPrompt] = React.useState('')
  const [referenceUrl, setReferenceUrl] = React.useState('')
  const [showReference, setShowReference] = React.useState(false)
  const [model, setModel] = React.useState({ id: '', providerId: '' })
  const [modelReady, setModelReady] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const promptId = React.useId()
  const refId = React.useId()
  const errorId = React.useId()

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as { prompt?: string; referenceUrl?: string }
        if (draft.prompt) setPrompt(draft.prompt)
        if (draft.referenceUrl) {
          setReferenceUrl(draft.referenceUrl)
          setShowReference(true)
        }
        sessionStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      // Storage can be disabled outright. Losing a draft is survivable; a
      // thrown exception on first paint is not.
    }
    setModel(getStoredSelectedModel())
    setModelReady(true)
    // This is the primary action on the page it lives on, so it takes focus — but only with a
    // precise pointer. On a phone, focusing on load pops the keyboard over the page.
    if (window.matchMedia('(pointer: fine)').matches) textareaRef.current?.focus()
  }, [])

  const referenceRef = React.useRef<HTMLInputElement>(null)
  // The reference field appears because the user asked for it, so moving focus there is expected.
  React.useEffect(() => {
    if (showReference) referenceRef.current?.focus()
  }, [showReference])

  React.useEffect(() => {
    if (!modelReady) return
    setStoredSelectedModel(model)
  }, [model, modelReady])

  const starters = COMPOSER_STARTERS
  /** Set by a starter or template; typing a prompt of your own lets the generator decide. */
  const [target, setTarget] = React.useState<'static' | 'edge' | undefined>(undefined)

  const start = async () => {
    setError('')

    if (!prompt.trim()) {
      setError('Describe what you want to build.')
      textareaRef.current?.focus()
      return
    }
    if (busy) return

    if (!user) {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt, referenceUrl }))
      } catch {
        // See above.
      }
      router.push(`/handler/sign-in?after_auth_return_to=${encodeURIComponent('/')}`)
      return
    }

    const reference = referenceUrl.trim()
    if (reference && !isHttpUrl(reference)) {
      setError('The reference URL has to start with http:// or https://')
      return
    }

    setBusy(true)
    try {
      let lastError = 'That project could not be started. Try again.'
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch('/api/check-name', {
          method: 'POST',
          headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: slugify(prompt),
            prompt: prompt.trim(),
            referenceUrl: reference || undefined,
            target,
            selectedModel: model.id || undefined,
            providerId: model.providerId || undefined,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          router.push(`/edit/${data.name}`)
          return
        }

        const body = await response.json().catch(() => ({}))
        lastError = body.error || lastError
        // Only a name collision is worth another attempt; the suffix is random.
        if (response.status !== 409) break
      }
      throw new Error(lastError)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void start()
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {error && (
        <Callout
          tone="failed"
          icon={<TriangleAlert className="size-4" />}
          className="mb-3 anim-rise"
        >
          <span id={errorId}>{error}</span>
        </Callout>
      )}

      <PlateFrame>
      <div className="composer">
        <label htmlFor={promptId} className="sr-only">
          Describe the application you want
        </label>
        <textarea
          ref={textareaRef}
          id={promptId}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value)
            setTarget(undefined)
          }}
          onKeyDown={onKeyDown}
          placeholder="A tool that tracks freelance invoices, flags the overdue ones, and charts monthly income"
          disabled={busy}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : undefined}
          className="max-h-72 min-h-28 w-full resize-none bg-transparent px-3 py-3 text-base leading-relaxed outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-60"
        />

        {showReference && (
          <div className="border-t border-[var(--rule)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={refId} className="text-xs font-medium text-[var(--foreground)]">
                Reference site
              </label>
              <IconButton
                label="Remove reference site"
                size="sm"
                onClick={() => {
                  setShowReference(false)
                  setReferenceUrl('')
                }}
              >
                <X className="size-3.5" />
              </IconButton>
            </div>
            <input
              id={refId}
              ref={referenceRef}
              type="url"
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="https://example.com"
              disabled={busy}
              className="mt-1.5 h-8 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--background)] px-2.5 text-sm outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--ring)]"
            />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Its layout and palette are used as visual cues. Its content is not copied.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-0.5">
            {!showReference && (
              <button
                type="button"
                onClick={() => setShowReference(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
              >
                <Link2 className="size-3.5" />
                Reference a site
              </button>
            )}
            <ModelPicker
              selectedModelId={model.id}
              providerId={model.providerId}
              onModelChange={(id, providerId) => setModel({ id, providerId })}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Kbd className="hidden sm:inline-flex">Ctrl + Enter</Kbd>
            <Button
              intent="primary"
              size="md"
              onClick={() => void start()}
              busy={busy}
              aria-label="Build this"
            >
              Build
              <ArrowUp className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      </PlateFrame>

      {/* Onboarding: the two targets, stated before the first build rather than discovered after. */}
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
        <span className="font-medium text-[var(--foreground)]">Static</span> apps are pages and browser code, and run
        anywhere. <span className="font-medium text-[var(--foreground)]">Edge</span> apps add a Cloudflare Worker and
        storage (D1, KV, R2) in your own Cloudflare account. Ask for saved data and you get an edge app.
      </p>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {EDGE_TEMPLATES.map((template) => (
          <button
            key={template.label}
            type="button"
            aria-pressed={prompt === template.prompt}
            onClick={() => {
              setPrompt(template.prompt)
              setTarget('edge')
              textareaRef.current?.focus()
            }}
            className="rounded-md border border-[var(--rule)] bg-[var(--surface-1)] px-2.5 py-2 text-left transition-colors duration-[var(--dur-1)] hover:border-[var(--rule-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] aria-pressed:border-[var(--ring)]"
          >
            <span className="block text-xs font-medium">{template.label}</span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{template.detail}</span>
          </button>
        ))}
      </div>

      {starters && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {starters.map(({ prompt: starter, target: starterTarget }) => (
            <button
              key={starter}
              type="button"
              title={starterTarget === 'edge' ? 'Edge app: stores data on Cloudflare' : 'Static app'}
              onClick={() => {
                setPrompt(starter)
                setTarget(starterTarget)
                textareaRef.current?.focus()
              }}
              className="max-w-full truncate rounded-md border border-[var(--rule)] bg-[var(--surface-1)] px-2.5 py-1 text-left text-xs text-[var(--muted-foreground)] transition-colors duration-[var(--dur-1)] hover:border-[var(--rule-strong)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function slugify(text: string) {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base || 'app'}-${suffix}`
}
