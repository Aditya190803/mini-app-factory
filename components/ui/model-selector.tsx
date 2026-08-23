'use client';

import React, { useEffect, useState, useRef } from 'react';
import { CaretDownIcon, CheckIcon, CircuitryIcon, EyeIcon } from '@phosphor-icons/react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

interface Model {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  providerId: string;
  hasVision?: boolean;
}

// Module-level cache — survives across mounts, shared by all instances
let cachedModels: Model[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelSelectorProps {
  selectedModelId?: string;
  providerId?: string;
  onModelChange: (modelId: string, providerId: string) => void;
  className?: string;
}

export function ModelSelector({ selectedModelId, providerId, onModelChange, className }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>(cachedModels ?? []);
  const [loading, setLoading] = useState(!cachedModels);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const isCacheValid = cachedModels && (Date.now() - cacheTimestamp < CACHE_TTL_MS);

    // If cache is valid, show it immediately and skip fetch
    if (isCacheValid) {
      setModels(cachedModels!);
      setLoading(false);
      return;
    }

    // If we have stale cache, show it immediately but refresh in background
    const hasStaleCache = !!cachedModels;
    if (hasStaleCache) {
      setModels(cachedModels!);
      setLoading(false);
    }

    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchModels() {
      try {
        const resp = await fetch('/api/ai/models', { signal: controller.signal });

        if (!resp.ok) {
          if (!hasStaleCache) setError(true);
          return;
        }

        const data = await resp.json();
        const serverModels: Model[] = Array.isArray(data.models) ? data.models : [];

        // Update cache
        cachedModels = serverModels;
        cacheTimestamp = Date.now();

        if (!controller.signal.aborted) {
          setModels(serverModels);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!hasStaleCache) setError(true);
      } finally {
        if (!controller.signal.aborted && !hasStaleCache) {
          setLoading(false);
        }
      }
    }

    void fetchModels();

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, []);

  const selectedModel = models.find(m => m.id === selectedModelId && m.providerId === providerId);
  const isDefault = !selectedModelId || !providerId;
  const displayText = selectedModel ? selectedModel.name : 'Default model';

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 px-2.5 py-1.5', className)}>
        <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
        <span className="text-sm text-muted-foreground">Loading models…</span>
      </div>
    );
  }

  if (error || models.length === 0) {
    return (
      <div className={cn('px-2.5 py-1.5', className)}>
        <span className="text-sm text-destructive">Couldn’t load models</span>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Model: ${displayText}`}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors',
            'hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            className
          )}
        >
          <CircuitryIcon size={15} />
          <span className="max-w-[9rem] truncate">{displayText}</span>
          <CaretDownIcon
            size={11}
            weight="bold"
            className={cn('transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-30 w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elev-lg animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="custom-scrollbar max-h-[340px] overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => {
                onModelChange('', '');
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                isDefault ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">Default model</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Routed across available providers
                </span>
              </span>
              {isDefault && <CheckIcon size={15} weight="bold" className="shrink-0" />}
            </button>

            {['opencode', 'openrouter'].map(pId => {
              const providerModels = models.filter(m => m.providerId === pId);
              if (providerModels.length === 0) return null;

              return (
                <div key={pId} className="mt-1">
                  <p className="label-meta px-2.5 pb-1 pt-2">{pId}</p>
                  {providerModels.map((m) => {
                    const isSelected = m.id === selectedModelId && m.providerId === providerId;
                    return (
                      <button
                        key={`${m.providerId}-${m.id}`}
                        type="button"
                        onClick={() => {
                          onModelChange(m.id, m.providerId);
                          setOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{m.name}</span>
                            {m.hasVision && (
                              <span
                                title="Supports images"
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1 py-px text-[10px] text-muted-foreground"
                              >
                                <EyeIcon size={9} />
                                Vision
                              </span>
                            )}
                          </span>
                          {m.name !== m.id && (
                            <span className="block truncate font-mono text-xs text-muted-foreground">
                              {m.id}
                            </span>
                          )}
                        </span>
                        {isSelected && <CheckIcon size={15} weight="bold" className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
