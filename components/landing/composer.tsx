'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import { ArrowUp, Link2, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton, Kbd, Segmented, Callout } from '@/components/kit'
import { ModelPicker } from '@/components/shell/model-picker'
import { getStoredSelectedModel, setStoredSelectedModel, withAIAdminHeaders } from '@/lib/ai-admin-client'
import { isHttpUrl } from '@/lib/url-reference'
import { TARGETS, type BuildTarget } from '@/lib/targets'
import { EDGE_STARTERS, STATIC_STARTERS } from '@/lib/constants'

const DRAFT_KEY = 'maf:composer-draft'

type TargetChoice = BuildTarget | 'auto'

/**
 * The composer.
 *
 * The one new decision here is the target. It sits above the prompt rather
 * than buried in settings because it is the difference between "a site" and
 * "a site with a database behind it", and that difference decides what gets
 * provisioned in the user's Cloudflare account later. Auto is the default and
 * is honest about what it does: the model picks, and the choice is visible in
 * the editor afterwards either way.
 *
 * The draft survives a trip through sign-in. Writing what someone typed into
 * session storage and restoring it is the difference between signing in and
 * starting over.
 */
export function Composer({ className }: { className?: string }) {
  const router = useRouter()
  const user = useUser()

  const [prompt, setPrompt] = React.useState('')
  const [target, setTarget] = React.useState<TargetChoice>('auto')
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
        const draft = JSON.parse(raw) as { prompt?: string; referenceUrl?: string; target?: TargetChoice }
        if (draft.prompt) setPrompt(draft.prompt)
        if (draft.target) setTarget(draft.target)
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
    // This is the primary action on the page it lives on, so it takes focus.
    textareaRef.current?.focus()
  }, [])

  React.useEffect(() => {
    if (!modelReady) return
    setStoredSelectedModel(model)
  }, [model, modelReady])

  /**
   * Starters follow the chosen target. On "Decide for me" they alternate, so
   * the list itself demonstrates that both shapes come from the same box
   * rather than leaving a first-time visitor with no examples at all.
   */
  const starters =
    target === 'edge'
      ? EDGE_STARTERS.slice(0, 4)
      : target === 'static'
        ? STATIC_STARTERS.slice(0, 4)
        : [STATIC_STARTERS[0], EDGE_STARTERS[0], STATIC_STARTERS[1], EDGE_STARTERS[1]]

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
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ prompt, referenceUrl, target }))
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
            selectedModel: model.id || undefined,
            providerId: model.providerId || undefined,
            target: target === 'auto' ? undefined : target,
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

      <div className="composer">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] px-2.5 py-2">
          <Segmented
            label="What are you building"
            value={target}
            onChange={setTarget}
            size="sm"
            options={[
              { value: 'auto', label: 'Decide for me' },
              { value: 'static', label: TARGETS.static.label, title: TARGETS.static.summary },
              { value: 'edge', label: TARGETS.edge.label, title: TARGETS.edge.summary },
            ]}
          />
          <p className="hidden min-w-0 truncate text-xs text-[var(--muted-foreground)] sm:block">
            {target === 'auto'
              ? 'A database is added only if the app needs one.'
              : TARGETS[target].summary}
          </p>
        </div>

        <label htmlFor={promptId} className="sr-only">
          Describe the application you want
        </label>
        <textarea
          ref={textareaRef}
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
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
              type="url"
              value={referenceUrl}
              onChange={(event) => setReferenceUrl(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="https://example.com"
              disabled={busy}
              autoFocus
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

      {starters && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => {
                setPrompt(starter)
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
