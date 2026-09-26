'use client'

import * as React from 'react'
import Editor from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useTheme } from 'next-themes'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { Button } from '@/components/kit'

interface CodePanelProps {
  html: string
  language?: 'html' | 'css' | 'javascript' | 'sql' | 'json'
  onChange: (val: string | undefined) => void
  onReset: () => void
  searchText?: string
}

/**
 * The code pane.
 *
 * Monaco follows the app's theme rather than being pinned to vs-dark. The old
 * behaviour left a hard black rectangle inside a light interface, which is the
 * kind of seam that makes an editor feel bolted on.
 *
 * `searchText` is how a click in the preview lands on the right line: the
 * element's markup is cleaned of the preview harness's own attributes and
 * matched against the model, exactly first, then on a leading chunk.
 */
export default function CodePanel({
  html,
  language = 'html',
  onChange,
  onReset,
  searchText,
}: CodePanelProps) {
  const editorRef = React.useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decorationRef = React.useRef<string[]>([])
  const [copied, setCopied] = React.useState(false)
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const { resolvedTheme } = useTheme()

  React.useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    []
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // Blocked clipboard, for example on an insecure origin. The text is
      // still selectable in the editor.
    }
  }

  React.useEffect(() => {
    if (!searchText || !editorRef.current) return
    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    // The preview harness injects attributes of its own. Strip them before
    // matching, or nothing in the source will ever line up.
    const cleaned = searchText
      .replace(/ data-source-file="[^"]*"/g, '')
      .replace(/ style="display: contents;"/g, '')
      .trim()

    let matches = model.findMatches(cleaned, true, false, true, null, true)
    if (matches.length === 0) {
      const partial = cleaned.length > 150 ? cleaned.slice(0, 150) : cleaned
      matches = model.findMatches(partial, true, false, true, null, true)
    }
    if (matches.length === 0) return

    const range = matches[0].range
    editor.revealRangeInCenter(range)
    decorationRef.current = editor.deltaDecorations(decorationRef.current, [
      { range, options: { inlineClassName: 'monaco-highlight-glow', isWholeLine: false } },
    ])
    editor.setSelection(range)
    editor.focus()
  }, [searchText])

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="absolute right-4 top-3 z-[var(--z-raised)] flex gap-1.5">
        <Button size="sm" onClick={() => void handleCopy()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          theme={resolvedTheme === 'light' ? 'vs' : 'vs-dark'}
          value={html}
          onChange={onChange}
          onMount={(editor) => {
            editorRef.current = editor
          }}
          options={{
            fontSize: 12.5,
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontLigatures: false,
            minimap: { enabled: false },
            padding: { top: 44, bottom: 20 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            guides: { indentation: true },
          }}
        />
      </div>
    </div>
  )
}
