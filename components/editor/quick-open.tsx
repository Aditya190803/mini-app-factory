'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectFile } from '@/lib/page-builder';

/**
 * Jump to a file (Ctrl+P).
 *
 * A Radix dialog, so focus is trapped and restored, and a WAI-ARIA combobox: the input owns a
 * listbox and points at the highlighted option with aria-activedescendant, so screen readers
 * announce the result being moved through. The hand-built overlay it replaces had neither.
 * Positioned near the top rather than centred: it is a command surface.
 */
export default function QuickOpen({
  open,
  onOpenChange,
  files,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ProjectFile[];
  onSelect: (path: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const matches = React.useMemo(() => {
    const search = query.trim().toLowerCase();
    return search ? files.filter((file) => file.path.toLowerCase().includes(search)) : files;
  }, [files, query]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const choose = (path: string | undefined) => {
    if (!path) return;
    onSelect(path);
    onOpenChange(false);
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-[oklch(0.14_0.006_62/0.4)]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="anim-rise fixed left-1/2 top-[12vh] z-[var(--z-modal)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--popover)] shadow-[var(--shadow-lg)]"
        >
          <DialogPrimitive.Title className="sr-only">Jump to a file</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Type to filter files by path. Arrow keys move through the results and Enter opens one.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-[var(--rule)] px-3">
            <Search aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches.length ? optionId(activeIndex) : undefined}
              aria-label="Search files by path"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files"
              className="h-11 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[var(--muted-foreground)]"
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  setActiveIndex(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  setActiveIndex(Math.max(matches.length - 1, 0));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  choose(matches[activeIndex]?.path);
                }
              }}
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Matching files"
            className="scroll-thin max-h-80 overflow-y-auto p-1"
          >
            {matches.length > 0 ? (
              matches.map((file, index) => (
                <div
                  key={file.path}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(file.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') choose(file.path);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left transition-colors',
                    index === activeIndex ? 'row-selected' : 'hover:bg-[var(--surface-3)]'
                  )}
                >
                  <span aria-hidden className="inline-block h-3 w-[3px] shrink-0 rounded-[1px] bg-[var(--rule-strong)]" />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.path}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                    {file.fileType}
                  </span>
                </div>
              ))
            ) : (
              <p role="status" className="px-3 py-10 text-center text-sm text-[var(--muted-foreground)]">
                No file matches that.
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
