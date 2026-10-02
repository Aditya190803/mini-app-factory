'use client';

import * as React from 'react';
import { useConvex } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Badge, Button, Callout, EmptyState, Modal, ModalContent, Skeleton } from '@/components/kit';
import { changedFiles, diffLines, type FileChange } from '@/lib/line-diff';
import type { ProjectFile } from '@/lib/page-builder';
import { cn } from '@/lib/utils';

type VersionRow = { _id: Id<'projectVersions'>; summary: string; createdAt: number };

const STATUS_TONE = { added: 'live', removed: 'failed', changed: 'warning' } as const;

/**
 * Version history: every build, labelled with the request that made it, with a diff against the
 * current files before anything is restored. The old history was a 30-item menu that restored
 * on click, with no way to see what a version contained.
 */
export default function VersionHistoryDialog({
  open,
  onOpenChange,
  projectId,
  currentFiles,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<'projects'> | undefined;
  currentFiles: ProjectFile[];
  onRestore: (versionId: string) => Promise<void>;
}) {
  const convex = useConvex();
  const [versions, setVersions] = React.useState<VersionRow[]>([]);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingList, setLoadingList] = React.useState(false);
  const [selected, setSelected] = React.useState<VersionRow | null>(null);
  const [snapshot, setSnapshot] = React.useState<ProjectFile[] | null>(null);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadPage = React.useCallback(async (before?: number) => {
    if (!projectId) return;
    setLoadingList(true);
    try {
      const page = await convex.query(api.conversations.listVersions, { projectId, before });
      setVersions((current) => (before === undefined ? page : [...current, ...page]));
      setHasMore(page.length === 30);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the history');
    } finally {
      setLoadingList(false);
    }
  }, [convex, projectId]);

  React.useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSnapshot(null);
    setError(null);
    void loadPage();
  }, [open, loadPage]);

  React.useEffect(() => {
    if (!selected || !projectId) return;
    let cancelled = false;
    setSnapshot(null);
    setSelectedPath(null);
    convex
      .query(api.conversations.getVersionFiles, { projectId, versionId: selected._id })
      .then((files) => { if (!cancelled) setSnapshot(files as ProjectFile[]); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load that version'); });
    return () => { cancelled = true; };
  }, [convex, projectId, selected]);

  // What restoring would do: from the current files to the version's files.
  const changes: FileChange[] = React.useMemo(
    () => (snapshot ? changedFiles(currentFiles, snapshot) : []),
    [currentFiles, snapshot]
  );
  const activePath = selectedPath ?? changes[0]?.path ?? null;
  const diff = React.useMemo(() => {
    if (!snapshot || !activePath) return null;
    const before = currentFiles.find((file) => file.path === activePath)?.content ?? '';
    const after = snapshot.find((file) => file.path === activePath)?.content ?? '';
    return diffLines(before, after);
  }, [activePath, currentFiles, snapshot]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="lg"
        className="max-w-5xl"
        title="Version history"
        description="Every build, newest first. Pick one to see how it differs from your current files before restoring it."
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
            <Button
              intent="primary"
              disabled={!selected || !snapshot}
              onClick={async () => {
                if (!selected) return;
                await onRestore(selected._id);
                onOpenChange(false);
              }}
            >
              Restore this version
            </Button>
          </>
        }
      >
        {error && <Callout tone="failed" title={error} className="mb-3" />}
        <div className="grid min-h-[22rem] gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-1" role="listbox" aria-label="Versions">
            {versions.length === 0 && loadingList && <Skeleton className="h-24" />}
            {versions.length === 0 && !loadingList && (
              <EmptyState title="No versions yet"><p>Each build adds one.</p></EmptyState>
            )}
            {versions.map((version) => (
              <button
                key={version._id}
                type="button"
                role="option"
                aria-selected={selected?._id === version._id}
                onClick={() => setSelected(version)}
                className={cn(
                  'rounded-md px-2 py-1.5 text-left transition-colors',
                  selected?._id === version._id ? 'row-selected' : 'hover:bg-[var(--surface-2)]'
                )}
              >
                <span className="line-clamp-2 text-sm">{version.summary}</span>
                <span className="tabular block text-xs text-[var(--muted-foreground)]">
                  {new Date(version.createdAt).toLocaleString()}
                </span>
              </button>
            ))}
            {hasMore && versions.length > 0 && (
              <Button size="sm" busy={loadingList} onClick={() => void loadPage(versions[versions.length - 1]!.createdAt)}>
                Load older versions
              </Button>
            )}
          </div>

          <div className="min-w-0">
            {!selected ? (
              <p className="text-sm text-[var(--muted-foreground)]">Select a version to compare it with your current files.</p>
            ) : !snapshot ? (
              <Skeleton className="h-40" />
            ) : changes.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">This version is identical to your current files.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Restoring changes {changes.length} file{changes.length === 1 ? '' : 's'}:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {changes.map((change) => (
                    <button
                      key={change.path}
                      type="button"
                      onClick={() => setSelectedPath(change.path)}
                      aria-pressed={activePath === change.path}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs',
                        activePath === change.path ? 'border-[var(--ring)]' : 'border-[var(--rule)]'
                      )}
                    >
                      {change.path}
                      <Badge tone={STATUS_TONE[change.status]}>{change.status === 'added' ? 'restored' : change.status === 'removed' ? 'deleted' : 'changed'}</Badge>
                    </button>
                  ))}
                </div>
                {diff === null ? (
                  <p className="text-sm text-[var(--muted-foreground)]">This file is too large to compare line by line.</p>
                ) : (
                  <pre className="scroll-thin max-h-[40vh] overflow-auto rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-2 font-mono text-xs leading-relaxed">
                    {diff.map((line, index) => (
                      <div
                        key={index}
                        className={cn(
                          'whitespace-pre-wrap break-all px-1',
                          line.kind === 'added' && 'bg-[color-mix(in_oklab,var(--success)_14%,transparent)]',
                          line.kind === 'removed' && 'bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)]'
                        )}
                      >
                        <span aria-hidden className="mr-2 select-none text-[var(--muted-foreground)]">
                          {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                        </span>
                        <span className="sr-only">{line.kind === 'added' ? 'Added: ' : line.kind === 'removed' ? 'Removed: ' : ''}</span>
                        {line.text}
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
