'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { GitBranch, RefreshCw } from 'lucide-react'
import { Badge, Button, Callout, Section, SpecTable } from '@/components/kit'
import { useConfirm } from '@/hooks/use-confirm'

type SyncPreview = {
  repository: string
  branch: string
  fileCount: number
  diff: { added: string[]; changed: string[]; removed: string[] }
}

/**
 * Pulling from the linked repository.
 *
 * Comparing is a separate step from pulling on purpose. A pull replaces local
 * files, so the user gets to see the exact list of what would change first,
 * and the confirmation names the count.
 */
export default function GitHubProjectSync({
  projectName,
  repoUrl,
}: {
  projectName: string
  repoUrl?: string
}) {
  const { confirm, confirmDialog } = useConfirm()
  const [preview, setPreview] = React.useState<SyncPreview | null>(null)
  const [busy, setBusy] = React.useState(false)

  const request = async (method: 'GET' | 'POST') => {
    setBusy(true)
    try {
      const url = `/api/integrations/github/sync?projectName=${encodeURIComponent(projectName)}`
      const response = await fetch(
        url,
        method === 'POST'
          ? {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectName }),
            }
          : undefined
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The sync failed')
      setPreview(data)
      if (method === 'POST') {
        toast.success('Pulled from GitHub', {
          description: `${data.fileCount} files are now in the editor. The previous state is in version history.`,
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The sync failed')
    } finally {
      setBusy(false)
    }
  }

  if (!repoUrl) return null

  const changeCount = preview
    ? preview.diff.added.length + preview.diff.changed.length + preview.diff.removed.length
    : 0

  return (
    <Section
      title="GitHub sync"
      description="Compare the linked repository before pulling. Pulling replaces the project files with the repository's default branch. Binary assets are left alone."
      actions={
        <div className="flex gap-2">
          <Button busy={busy} onClick={() => void request('GET')}>
            <RefreshCw className="size-3.5" />
            Compare
          </Button>
          {preview && changeCount > 0 && (
            <Button
              intent="primary"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  const ok = await confirm({
                    title: `Pull ${changeCount} change${changeCount === 1 ? '' : 's'}?`,
                    description:
                      'Local files are replaced by the repository. The current state is saved as a version first, so this is recoverable.',
                    confirmLabel: 'Pull from GitHub',
                  })
                  if (ok) void request('POST')
                })()
              }}
            >
              Pull
            </Button>
          )}
        </div>
      }
    >
      {confirmDialog}

      {!preview ? (
        <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <GitBranch className="size-3.5" />
          Not compared yet.
        </p>
      ) : changeCount === 0 ? (
        <Callout tone="live" title="In sync">
          The editor and <span className="font-mono">{preview.repository}</span> on{' '}
          <span className="font-mono">{preview.branch}</span> hold the same {preview.fileCount}{' '}
          files.
        </Callout>
      ) : (
        <div className="space-y-3">
          <SpecTable
            dense
            caption="Repository"
            rows={[
              { key: 'repo', label: 'Repository', value: preview.repository, mono: true },
              { key: 'branch', label: 'Branch', value: preview.branch, mono: true },
              { key: 'files', label: 'Files in the repo', value: String(preview.fileCount), mono: true },
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {(['added', 'changed', 'removed'] as const).map((kind) => (
              <div key={kind} className="min-w-0">
                <p className="flex items-center gap-2">
                  <span className="key">{kind}</span>
                  <Badge tone={kind === 'removed' ? 'failed' : 'neutral'}>
                    {preview.diff[kind].length}
                  </Badge>
                </p>
                <ul className="mt-2 space-y-0.5">
                  {preview.diff[kind].slice(0, 8).map((path) => (
                    <li
                      key={path}
                      className="truncate font-mono text-[11px] text-[var(--muted-foreground)]"
                    >
                      {path}
                    </li>
                  ))}
                  {preview.diff[kind].length > 8 && (
                    <li className="font-mono text-[11px] text-[var(--muted-foreground)]">
                      and {preview.diff[kind].length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}
