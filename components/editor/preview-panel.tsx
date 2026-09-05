'use client'

import * as React from 'react'
import {
  Crosshair,
  ExternalLink,
  MessageSquarePlus,
  Monitor,
  PencilLine,
  RotateCw,
  Smartphone,
  Tablet,
} from 'lucide-react'
import type { ProjectFile } from '@/lib/page-builder'
import { Badge, Button, IconButton, Segmented, StatusDot } from '@/components/kit'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  previewHtml: string
  files: ProjectFile[]
  onOpenInEditor?: (path: string, elementHtml?: string, selector?: string) => void
  onAttachToChat?: (path: string, html: string, selector?: string) => void
  onOpenInNewTab?: () => void
  livePreviewUrl?: string
  isDeployingPreview?: boolean
  onDeployLivePreview?: () => void | Promise<void>
  onDeleteLivePreview?: () => void | Promise<void>
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

const WIDTHS: Record<ViewportMode, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

/**
 * The preview.
 *
 * Two sources, and which one is in use is stated rather than implied. The
 * default is a local render of the in-memory files, which updates as you type.
 * An edge app can also run against a real Cloudflare preview deployment, and
 * while it does the element selector is disabled: the frame is then a
 * different origin and there is no harness inside it to talk to.
 */
export default function PreviewPanel({
  previewHtml,
  files,
  onOpenInEditor,
  onAttachToChat,
  onOpenInNewTab,
  livePreviewUrl,
  isDeployingPreview,
  onDeployLivePreview,
  onDeleteLivePreview,
}: PreviewPanelProps) {
  const [mode, setMode] = React.useState<ViewportMode>('desktop')
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [selecting, setSelecting] = React.useState(false)
  const [menu, setMenu] = React.useState<{
    x: number
    y: number
    path: string
    html: string
    selector?: string | null
  } | null>(null)

  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const lastFilesRef = React.useRef<ProjectFile[]>(files)
  const vfsVersionRef = React.useRef(0)
  const vfsInitializedRef = React.useRef(false)

  const hasWorker = files.some((file) => file.fileType === 'worker')

  const buildVfsPayload = (input: ProjectFile[]) =>
    input.reduce<
      Record<string, { content: string; language: ProjectFile['language']; fileType: ProjectFile['fileType'] }>
    >((acc, file) => {
      acc[file.path] = { content: file.content, language: file.language, fileType: file.fileType }
      return acc
    }, {})

  // Style-only edits are hot-swapped rather than reloading the frame, which is
  // what keeps scroll position and any in-page state while you tune CSS.
  React.useEffect(() => {
    const changed = files.filter((file, index) => file.content !== lastFilesRef.current[index]?.content)
    const stylesOnly = changed.length > 0 && changed.every((file) => file.fileType === 'style')

    if (stylesOnly && iframeRef.current?.contentWindow) {
      for (const style of changed) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'update-css', file: style.path, content: style.content },
          '*'
        )
      }
      iframeRef.current.contentWindow.postMessage(
        { type: 'update-vfs', files: buildVfsPayload(changed), version: ++vfsVersionRef.current },
        '*'
      )
      lastFilesRef.current = files
      return
    }

    if (changed.length > 0 && iframeRef.current?.contentWindow && vfsInitializedRef.current) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'update-vfs', files: buildVfsPayload(changed), version: ++vfsVersionRef.current },
        '*'
      )
    }

    lastFilesRef.current = files
  }, [files])

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'element-selected') return
      const { path, elementHtml, x, y, selector } = event.data
      const frame = iframeRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      setMenu({ x: rect.left + x, y: rect.top + y, path, html: elementHtml, selector })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  React.useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'toggle-selector', active: selecting }, '*')
    if (!selecting) setMenu(null)
  }, [selecting])

  React.useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[data-selection-menu]')) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const act = (action: 'open' | 'attach') => {
    if (!menu) return
    if (action === 'open') onOpenInEditor?.(menu.path, menu.html, menu.selector ?? undefined)
    else onAttachToChat?.(menu.path, menu.html, menu.selector ?? undefined)
    setMenu(null)
    setSelecting(false)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <div className="flex h-[var(--bar-h)] shrink-0 items-center justify-between gap-3 border-b border-[var(--rule)] bg-[var(--surface-1)] px-3">
        <Segmented
          label="Preview width"
          value={mode}
          onChange={setMode}
          size="sm"
          options={[
            { value: 'desktop', label: '', icon: <Monitor className="size-3.5" />, title: 'Desktop' },
            { value: 'tablet', label: '', icon: <Tablet className="size-3.5" />, title: 'Tablet, 768px' },
            { value: 'mobile', label: '', icon: <Smartphone className="size-3.5" />, title: 'Mobile, 390px' },
          ]}
        />

        <div className="flex min-w-0 items-center gap-1.5">
          {hasWorker &&
            (livePreviewUrl ? (
              <>
                <span className="flex items-center gap-1.5 text-xs text-[var(--success-text)]">
                  <StatusDot tone="live" />
                  <span className="hidden md:inline">Running on Cloudflare</span>
                </span>
                <Button size="sm" onClick={() => void onDeleteLivePreview?.()}>
                  Take down
                </Button>
              </>
            ) : (
              <Button size="sm" busy={isDeployingPreview} onClick={() => void onDeployLivePreview?.()}>
                Run the backend
              </Button>
            ))}

          {!hasWorker && (
            <Badge tone="neutral" mono className="hidden md:inline-flex">
              static render
            </Badge>
          )}

          <IconButton
            label={selecting ? 'Turn off the element selector' : 'Pick an element in the preview'}
            aria-pressed={selecting}
            on={selecting}
            size="sm"
            disabled={Boolean(livePreviewUrl)}
            onClick={() => setSelecting((value) => !value)}
          >
            <Crosshair className="size-4" />
          </IconButton>
          <IconButton label="Reload the preview" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RotateCw className="size-3.5" />
          </IconButton>
          <IconButton label="Open the preview in a new tab" size="sm" onClick={onOpenInNewTab}>
            <ExternalLink className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto p-3 sm:p-5">
        <div
          className={cn(
            'h-full overflow-hidden rounded-lg border border-[var(--rule-strong)] bg-white shadow-[var(--shadow-md)]',
            'transition-[width] duration-[var(--dur-3)] ease-[var(--ease-out-quint)]'
          )}
          style={{ width: WIDTHS[mode], minHeight: mode === 'desktop' ? '100%' : '600px' }}
        >
          <iframe
            key={refreshKey}
            ref={iframeRef}
            {...(livePreviewUrl ? { src: livePreviewUrl } : { srcDoc: previewHtml })}
            className="size-full border-0"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            title="Project preview"
            onLoad={() => {
              const frame = iframeRef.current?.contentWindow
              if (!frame) return
              frame.postMessage(
                { type: 'init-vfs', files: buildVfsPayload(files), version: ++vfsVersionRef.current },
                '*'
              )
              vfsInitializedRef.current = true
              if (selecting) frame.postMessage({ type: 'toggle-selector', active: true }, '*')
            }}
          />
        </div>
      </div>

      {menu && (
        <div
          data-selection-menu
          role="menu"
          aria-label="Selected element"
          className="anim-rise fixed z-[var(--z-overlay)] min-w-48 overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--popover)] p-1 shadow-[var(--shadow-lg)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <p className="truncate px-2 py-1.5 font-mono text-[11px] text-[var(--muted-foreground)]">
            {menu.path}
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => act('open')}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-3)]"
          >
            <PencilLine className="size-3.5 text-[var(--muted-foreground)]" />
            Open in the editor
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => act('attach')}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-3)]"
          >
            <MessageSquarePlus className="size-3.5 text-[var(--muted-foreground)]" />
            Attach to the conversation
          </button>
        </div>
      )}
    </div>
  )
}
