'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { ProjectFile } from '@/lib/page-builder';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Library, Plus, Save, Trash2 } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; activeFile?: ProjectFile; files: ProjectFile[]; onInsert: (file: ProjectFile) => void; }

export default function ComponentLibraryDialog({ open, onOpenChange, activeFile, files, onInsert }: Props) {
  const components = useQuery(api.components.list, open ? {} : 'skip');
  const save = useMutation(api.components.save);
  const remove = useMutation(api.components.remove);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const saveActive = async () => {
    if (!activeFile || !name.trim()) return;
    setBusy(true);
    try {
      await save({ name, path: activeFile.path, content: activeFile.content, language: activeFile.language, fileType: activeFile.fileType });
      setName('');
      toast.success('Saved to your component library');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save component'); }
    finally { setBusy(false); }
  };

  const insert = (component: NonNullable<typeof components>[number]) => {
    const parts = component.path.split('/');
    const basename = parts.pop() || 'component.html';
    const dot = basename.lastIndexOf('.');
    const stem = dot > 0 ? basename.slice(0, dot) : basename;
    const extension = dot > 0 ? basename.slice(dot) : '';
    let path = component.path;
    let counter = 2;
    while (files.some((file) => file.path === path)) path = [...parts, `${stem}-${counter++}${extension}`].filter(Boolean).join('/');
    onInsert({ path, content: component.content, language: component.language, fileType: component.fileType });
    onOpenChange(false);
    toast.success(`Inserted ${component.name}`, { description: path });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[80vh] overflow-y-auto border-[var(--border)] bg-[var(--background)] sm:max-w-xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Library className="size-4" /> Component library</DialogTitle><DialogDescription>Save the active file once, then reuse it across any project.</DialogDescription></DialogHeader>
      <div className="flex gap-2 border-b border-[var(--border)] pb-5"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={activeFile ? `Name for ${activeFile.path}` : 'Select a file first'} disabled={!activeFile || busy} onKeyDown={(event) => { if (event.key === 'Enter') void saveActive(); }} /><Button type="button" onClick={() => void saveActive()} disabled={!activeFile || !name.trim() || busy}><Save className="mr-2 size-3.5" /> Save</Button></div>
      <div className="space-y-2">
        {components === undefined ? <p className="py-8 text-center text-xs text-[var(--muted-text)]">Loading library…</p> : null}
        {components?.length === 0 ? <div className="py-10 text-center"><Library className="mx-auto mb-3 size-6 text-[var(--muted-text)]" /><p className="text-sm">Your library is empty.</p><p className="mt-1 text-xs text-[var(--muted-text)]">Save the active file to create your first reusable component.</p></div> : null}
        {components?.map((component) => <div key={component._id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{component.name}</p><p className="truncate font-mono text-[10px] text-[var(--muted-text)]">{component.path} · {component.fileType}</p></div><Button type="button" size="sm" variant="outline" onClick={() => insert(component)}><Plus className="mr-1 size-3.5" /> Insert</Button><button type="button" className="grid size-8 place-items-center rounded-md text-[var(--muted-text)] hover:bg-red-500/10 hover:text-red-400" aria-label={`Delete ${component.name}`} onClick={async () => { await remove({ componentId: component._id }); toast.success('Component removed'); }}><Trash2 className="size-3.5" /></button></div>)}
      </div>
    </DialogContent>
  </Dialog>;
}
