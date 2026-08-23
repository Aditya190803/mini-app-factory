'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GitBranch, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';

type SyncPreview = { repository: string; branch: string; fileCount: number; diff: { added: string[]; changed: string[]; removed: string[] } };

export default function GitHubProjectSync({ projectName, repoUrl }: { projectName: string; repoUrl?: string }) {
  const { confirm, confirmDialog } = useConfirm();
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const request = async (method: 'GET' | 'POST') => {
    setBusy(true);
    try {
      const url = `/api/integrations/github/sync?projectName=${encodeURIComponent(projectName)}`;
      const response = await fetch(url, method === 'POST' ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) } : undefined);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'GitHub sync failed');
      setPreview(data);
      if (method === 'POST') toast.success('GitHub changes pulled', { description: `${data.fileCount} files are now in the editor. The previous state is in version history.` });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'GitHub sync failed'); }
    finally { setBusy(false); }
  };
  if (!repoUrl) return null;
  const changeCount = preview ? preview.diff.added.length + preview.diff.changed.length + preview.diff.removed.length : 0;
  return <section className="space-y-4 rounded-xl border border-border bg-card p-6">
    {confirmDialog}
    <div className="flex items-center gap-2"><GitBranch className="size-4 text-muted-foreground" /><h2 className="text-base font-semibold">GitHub sync</h2></div>
    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Compare the linked repository before pulling. Pulling replaces supported project files with the repository&apos;s default branch; unsupported binary assets are left out.</p>
    <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={busy} onClick={() => void request('GET')}><RefreshCw className={`mr-2 size-3.5 ${busy ? 'animate-spin' : ''}`} /> Check changes</Button>{preview && changeCount > 0 ? <Button disabled={busy} onClick={() => { void (async () => { if (await confirm({ title: `Pull ${changeCount} change${changeCount === 1 ? '' : 's'} from GitHub?`, description: 'This replaces local files. Create a project version first if you want a way back.', confirmLabel: 'Pull changes' })) void request('POST'); })(); }}>Pull from GitHub</Button> : null}</div>
    {preview ? <div className="space-y-3 rounded-md border border-[var(--border)] p-3 text-xs"><p><strong>{preview.repository}</strong> · {preview.branch} · {preview.fileCount} files</p>{changeCount === 0 ? <p className="text-success">Editor and GitHub are in sync.</p> : <div className="grid gap-3 sm:grid-cols-3">{(['added', 'changed', 'removed'] as const).map((kind) => <div key={kind}><p className="mb-1 font-medium capitalize">{kind} ({preview.diff[kind].length})</p><div className="space-y-1 font-mono text-xs text-muted-foreground">{preview.diff[kind].slice(0, 8).map((path) => <p key={path} className="truncate">{path}</p>)}{preview.diff[kind].length > 8 ? <p>+{preview.diff[kind].length - 8} more</p> : null}</div></div>)}</div>}</div> : null}
  </section>;
}
