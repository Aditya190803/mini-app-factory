'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Copy, Link2, Trash2, Users } from 'lucide-react';

export default function ProjectCollaboration({ projectId }: { projectId: Id<'projects'> }) {
  const access = useQuery(api.collaboration.listAccess, { projectId });
  const createInvite = useMutation(api.collaboration.createInvite);
  const revokeInvite = useMutation(api.collaboration.revokeInvite);
  const removeMember = useMutation(api.collaboration.removeMember);
  const updateMemberRole = useMutation(api.collaboration.updateMemberRole);
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);

  if (access === undefined) return <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 text-xs text-[var(--muted-text)]">Loading collaboration…</section>;
  if (access === null) return null;

  return <section className="space-y-5 border border-[var(--border)] bg-[var(--background-surface)] p-6">
    <div className="flex items-center gap-2 text-[var(--secondary-text)]"><Users className="size-4" /><h2 className="text-xs font-mono uppercase tracking-widest">Collaboration</h2></div>
    <p className="max-w-2xl text-xs leading-5 text-[var(--muted-text)]">Create a single-use invite that expires after seven days. Viewers get read-only access; editors can change files, run builds, and deploy. Only you can manage project access.</p>
    <div className="flex flex-wrap gap-2">
      <select value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')} className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-xs"><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { const inviteId = await createInvite({ projectId, role }); const url = `${window.location.origin}/invite/${inviteId}`; await navigator.clipboard.writeText(url); toast.success('Invite link copied', { description: 'Single use · expires in 7 days' }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create invite'); } finally { setBusy(false); } }}><Link2 className="mr-2 size-3.5" /> Create invite</Button>
    </div>
    {access.invites.length ? <div className="space-y-2"><h3 className="text-xs font-medium">Active invitations</h3>{access.invites.map((invite) => { const url = `${window.location.origin}/invite/${invite._id}`; return <div key={invite._id} className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><span className="flex-1">{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span><button type="button" onClick={async () => { await navigator.clipboard.writeText(url); toast.success('Invite copied'); }} aria-label="Copy invite"><Copy className="size-3.5" /></button><button type="button" onClick={() => void revokeInvite({ projectId, inviteId: invite._id })} aria-label="Revoke invite"><Trash2 className="size-3.5 text-red-400" /></button></div>; })}</div> : null}
    {access.members.length ? <div className="space-y-2"><h3 className="text-xs font-medium">Members</h3>{access.members.map((member) => <div key={member._id} className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-xs"><code className="min-w-0 flex-1 truncate">{member.userId}</code><select value={member.role} onChange={(event) => void updateMemberRole({ projectId, memberId: member._id, role: event.target.value as 'editor' | 'viewer' })} className="rounded border border-[var(--border)] bg-[var(--background)] p-1"><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button type="button" onClick={() => void removeMember({ projectId, memberId: member._id })} aria-label="Remove member"><Trash2 className="size-3.5 text-red-400" /></button></div>)}</div> : null}
  </section>;
}
