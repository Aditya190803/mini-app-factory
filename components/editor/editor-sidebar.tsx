'use client'

import * as React from 'react'
import { ArrowUp, AtSign, History, Paperclip, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Button,
  IconButton,
  Kbd,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Segmented,
} from '@/components/kit'
import { ModelPicker } from '@/components/shell/model-picker'
import TransformProgress, { type TransformProgressState } from './transform-progress'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  files?: string[]
}

interface EditorSidebarProps {
  transformPrompt: string
  setTransformPrompt: (val: string) => void
  selectedModel: { id: string; providerId: string }
  setSelectedModel: (val: { id: string; providerId: string }) => void
  selectedElement: { path: string; html: string; selector?: string } | null
  setSelectedElement: (val: { path: string; html: string; selector?: string } | null) => void
  runTransform: (promptOverride?: string) => void | Promise<void>
  runPolish: () => void
  isTransforming: boolean
  transformProgress?: TransformProgressState | null
  onCancelTransform?: () => void
  messages?: Message[]
  versions?: Array<{ id: string; summary: string }>
  onRestoreVersion?: (id: string) => void | Promise<void>
  mode?: 'build' | 'discuss'
  onModeChange?: (mode: 'build' | 'discuss') => void
  filePaths?: string[]
}

/**
 * The conversation pane.
 *
 * Two modes with genuinely different consequences: build writes files, discuss
 * does not. They are a segmented control rather than a hidden toggle because
 * sending a question in build mode and watching the project change is the
 * mistake that costs the most to undo.
 *
 * Assistant turns are plain text on the ground. Only the user's turns get a
 * surface, which is what makes the thread readable at a glance: the raised
 * blocks are the things you said.
 */
export default function EditorSidebar({
  transformPrompt,
  setTransformPrompt,
  selectedModel,
  setSelectedModel,
  selectedElement,
  setSelectedElement,
  runTransform,
  runPolish,
  isTransforming,
  transformProgress = null,
  onCancelTransform,
  messages = [],
  versions = [],
  onRestoreVersion,
  mode = 'build',
  onModeChange,
  filePaths = [],
}: EditorSidebarProps) {
  const attachmentInput = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [attachments, setAttachments] = React.useState<Array<{ name: string; content: string }>>([])

  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [messages.length, transformProgress])

  const withAttachments = () =>
    [
      transformPrompt.trim(),
      ...attachments.map((a) => `\n[Attached file: ${a.name}]\n${a.content}`),
    ]
      .join('\n')
      .trim()

  const submit = () => {
    if (isTransforming || !transformPrompt.trim()) return
    void runTransform(withAttachments())
    setAttachments([])
  }

  const addAttachments = async (files: FileList | null) => {
    if (!files) return
    const next: Array<{ name: string; content: string }> = []
    for (const file of Array.from(files).slice(0, 3)) {
      // Bigger than this and the file is not context, it is the whole prompt.
      if (file.size > 64 * 1024) continue
      next.push({ name: file.name, content: (await file.text()).slice(0, 24_000) })
    }
    setAttachments((current) => [...current, ...next].slice(0, 3))
    if (attachmentInput.current) attachmentInput.current.value = ''
  }

  const targetLabel = React.useMemo(() => {
    if (!selectedElement) return null
    try {
      const doc = new DOMParser().parseFromString(selectedElement.html, 'text/html')
      const element = doc.body.firstElementChild
      return element ? `${element.tagName.toLowerCase()} in ${selectedElement.path}` : selectedElement.path
    } catch {
      return selectedElement.path
    }
  }, [selectedElement])

  const canSend = !isTransforming && Boolean(transformPrompt.trim())

  return (
    <aside
      className="flex h-full w-[24rem] flex-col border-r border-[var(--rule)] bg-[var(--sidebar)] max-xl:w-[21rem]"
      aria-label="Project conversation"
    >
      <div className="flex h-[var(--bar-h)] shrink-0 items-center justify-between gap-2 border-b border-[var(--rule)] px-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Conversation</h2>
          <p className="tabular truncate text-xs text-[var(--muted-foreground)]">
            {messages.length
              ? `${messages.length} message${messages.length === 1 ? '' : 's'}`
              : 'Start with a request'}
          </p>
        </div>

        {versions.length > 0 && onRestoreVersion && (
          <Menu>
            <MenuTrigger asChild>
              <IconButton label="Version history" size="sm">
                <History className="size-4" />
              </IconButton>
            </MenuTrigger>
            <MenuContent className="max-h-72 w-72 overflow-y-auto">
              <MenuLabel>Restore a previous build</MenuLabel>
              <MenuSeparator />
              {versions.map((version) => (
                <MenuItem
                  key={version.id}
                  onSelect={() => void onRestoreVersion(version.id)}
                  className="block truncate"
                >
                  {version.summary}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scroll-thin flex-1 overflow-y-auto scroll-smooth px-3 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-[17rem] text-center">
            <span className="mx-auto mb-3 grid size-9 place-items-center rounded-md border border-[var(--rule)] bg-[var(--surface-2)] text-[var(--muted-foreground)]">
              <Sparkles className="size-4" />
            </span>
            <p className="text-sm font-medium">Ask for the next change</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              Features, API routes, schema changes, or a visual pass. Each request lists the files it
              touched.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div key={message.id} className="anim-rise flex justify-end">
                    <div className="max-w-[92%] rounded-lg rounded-br-sm border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2 text-sm leading-relaxed">
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                )
              }

              if (message.role === 'system') {
                return (
                  <div
                    key={message.id}
                    role="alert"
                    className="anim-rise rounded-md border border-[color-mix(in_oklab,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] p-3 text-sm text-[var(--destructive-text)]"
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                )
              }

              return (
                <div key={message.id} className="anim-rise text-sm leading-relaxed">
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.files?.length ? (
                    <ul className="mt-2 space-y-0.5 border-t border-[var(--rule)] pt-2">
                      {message.files.map((path) => (
                        <li
                          key={path}
                          className="flex items-center gap-2 font-mono text-[11px] text-[var(--muted-foreground)]"
                        >
                          <span className="inline-block h-2.5 w-[3px] shrink-0 rounded-[1px] bg-[var(--signal-text)]" />
                          <span className="truncate">{path}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[var(--rule)] p-2.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <Segmented
            label="Conversation mode"
            value={mode}
            onChange={(next) => onModeChange?.(next)}
            size="sm"
            options={[
              { value: 'build', label: 'Build', title: 'Writes files' },
              { value: 'discuss', label: 'Discuss', title: 'Answers without changing anything' },
            ]}
          />
          <span className="truncate text-xs text-[var(--muted-foreground)]">
            {mode === 'build' ? 'Writes files' : 'Changes nothing'}
          </span>
        </div>

        {selectedElement && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--rule)] bg-[var(--signal-wash)] px-2.5 py-1.5">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--signal-text)]" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--muted-foreground)]">
              {targetLabel}
            </span>
            <IconButton
              label="Clear the selected element"
              size="sm"
              onClick={() => setSelectedElement(null)}
            >
              <X className="size-3.5" />
            </IconButton>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <button
                key={attachment.name}
                type="button"
                onClick={() =>
                  setAttachments((current) => current.filter((item) => item !== attachment))
                }
                title={`Remove ${attachment.name}`}
                className="inline-flex max-w-44 items-center gap-1 truncate rounded-md border border-[var(--rule)] px-2 py-0.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              >
                <span className="truncate">{attachment.name}</span>
                <X className="size-3 shrink-0" />
              </button>
            ))}
          </div>
        )}

        <div className="composer">
          <label htmlFor="editor-composer" className="sr-only">
            {mode === 'discuss' ? 'Ask about this project' : 'Describe a change'}
          </label>
          <textarea
            id="editor-composer"
            value={transformPrompt}
            onChange={(event) => setTransformPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={
              mode === 'discuss'
                ? 'Ask about this project'
                : selectedElement
                  ? 'Describe the change to this element'
                  : 'Ask for a change'
            }
            className="max-h-44 min-h-[4.5rem] w-full resize-none bg-transparent px-2.5 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--muted-foreground)]"
          />

          <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
            <div className="flex items-center gap-0.5">
              <input
                ref={attachmentInput}
                type="file"
                multiple
                accept=".txt,.md,.html,.css,.js,.ts,.json,.jsonc,.sql,.svg"
                className="hidden"
                onChange={(event) => void addAttachments(event.target.files)}
              />
              <IconButton
                label="Attach a file"
                size="sm"
                onClick={() => attachmentInput.current?.click()}
              >
                <Paperclip className="size-3.5" />
              </IconButton>

              {filePaths.length > 0 && (
                <label
                  className="relative grid size-7 place-items-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                  title="Reference a project file"
                >
                  <AtSign className="size-3.5" />
                  <select
                    aria-label="Reference a project file"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        setTransformPrompt(
                          `${transformPrompt}${transformPrompt ? '\n' : ''}@${event.target.value} `
                        )
                      }
                      event.target.value = ''
                    }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    <option value="">Reference a file</option>
                    {filePaths.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <IconButton
                label="Ask for a polish pass"
                size="sm"
                disabled={isTransforming}
                onClick={runPolish}
              >
                <Sparkles className="size-3.5" />
              </IconButton>
            </div>

            <div className="flex items-center gap-1.5">
              <Kbd className="hidden xl:inline-flex">Ctrl + Enter</Kbd>
              <IconButton
                label={mode === 'build' ? 'Send build request' : 'Send question'}
                size="sm"
                disabled={!canSend}
                onClick={submit}
                className={cn(
                  canSend &&
                    'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] hover:text-[var(--primary-foreground)]'
                )}
              >
                <ArrowUp className="size-3.5" />
              </IconButton>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <ModelPicker
            selectedModelId={selectedModel.id}
            providerId={selectedModel.providerId}
            onModelChange={(id, providerId) => setSelectedModel({ id, providerId })}
          />
          {isTransforming && onCancelTransform && (
            <Button size="sm" onClick={onCancelTransform}>
              Stop
            </Button>
          )}
        </div>

        <TransformProgress state={transformProgress} />
      </div>
    </aside>
  )
}
