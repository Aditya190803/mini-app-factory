'use client'

import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Cpu, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

type Model = {
  id: string
  name: string
  fullName: string
  provider: string
  providerId: string
  hasVision?: boolean
}

/**
 * Module-level cache, shared by every mount. The model list is fetched live
 * from the providers on each visit, so it is worth not doing that once per
 * component instance on a page that renders two of them.
 */
let cachedModels: Model[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const PROVIDER_ORDER = ['opencode', 'openrouter'] as const

export function ModelPicker({
  selectedModelId,
  providerId,
  onModelChange,
  className,
  align = 'start',
}: {
  selectedModelId?: string
  providerId?: string
  onModelChange: (modelId: string, providerId: string) => void
  className?: string
  align?: 'start' | 'end'
}) {
  const [models, setModels] = React.useState<Model[]>(cachedModels ?? [])
  const [loading, setLoading] = React.useState(!cachedModels)
  const [failed, setFailed] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      setModels(cachedModels)
      setLoading(false)
      return
    }

    // Stale cache is still shown while the refresh runs, so the control never
    // flickers back to a loading state once it has had content.
    const hadStale = Boolean(cachedModels)
    if (hadStale && cachedModels) {
      setModels(cachedModels)
      setLoading(false)
    }

    const controller = new AbortController()

    void (async () => {
      try {
        const response = await fetch('/api/ai/models', { signal: controller.signal })
        if (!response.ok) {
          if (!hadStale) setFailed(true)
          return
        }
        const data = await response.json()
        const next: Model[] = Array.isArray(data.models) ? data.models : []
        cachedModels = next
        cacheTimestamp = Date.now()
        if (!controller.signal.aborted) setModels(next)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (!hadStale) setFailed(true)
      } finally {
        if (!controller.signal.aborted && !hadStale) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [])

  const selected = models.find((model) => model.id === selectedModelId && model.providerId === providerId)
  const isDefault = !selectedModelId || !providerId
  const display = selected ? selected.name : 'Default model'

  if (loading) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 text-xs text-[var(--muted-foreground)]', className)}>
        <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" />
        Loading models
      </span>
    )
  }

  if (failed || models.length === 0) {
    return (
      <span className={cn('px-2 py-1 text-xs text-[var(--destructive-text)]', className)}>
        Model list unavailable
      </span>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Model: ${display}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
            'text-[var(--muted-foreground)] transition-colors duration-[var(--dur-1)]',
            'hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]',
            className
          )}
        >
          <Cpu className="size-3.5" />
          <span className="max-w-[9rem] truncate">{display}</span>
          <ChevronDown className={cn('size-3 transition-transform duration-[var(--dur-2)]', open && 'rotate-180')} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          className="z-[var(--z-overlay)] w-[21rem] overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-md)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="scroll-thin max-h-[21rem] overflow-y-auto p-1">
            <ModelOption
              name="Default model"
              detail="Routed across whichever providers are available"
              selected={isDefault}
              onSelect={() => {
                onModelChange('', '')
                setOpen(false)
              }}
            />

            {PROVIDER_ORDER.map((provider) => {
              const group = models.filter((model) => model.providerId === provider)
              if (group.length === 0) return null
              return (
                <div key={provider} className="mt-1">
                  <p className="key px-2 pb-1 pt-2">{provider}</p>
                  {group.map((model) => (
                    <ModelOption
                      key={`${model.providerId}-${model.id}`}
                      name={model.name}
                      detail={model.name === model.id ? undefined : model.id}
                      vision={model.hasVision}
                      selected={model.id === selectedModelId && model.providerId === providerId}
                      onSelect={() => {
                        onModelChange(model.id, model.providerId)
                        setOpen(false)
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ModelOption({
  name,
  detail,
  vision,
  selected,
  onSelect,
}: {
  name: string
  detail?: string
  vision?: boolean
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-[5px] px-2 py-1.5 text-left',
        'transition-colors duration-[var(--dur-1)]',
        selected ? 'row-selected' : 'hover:bg-[var(--surface-3)]'
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          {vision && (
            <span
              title="Accepts images"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border border-[var(--rule)] px-1 text-[10px] text-[var(--muted-foreground)]"
            >
              <Eye className="size-2.5" />
              vision
            </span>
          )}
        </span>
        {detail && (
          <span className="block truncate font-mono text-[11px] text-[var(--muted-foreground)]">{detail}</span>
        )}
      </span>
      {selected && <Check className="size-3.5 shrink-0 text-[var(--signal-text)]" />}
    </button>
  )
}
