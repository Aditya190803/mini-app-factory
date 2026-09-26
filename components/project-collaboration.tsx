'use client'

import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Link2, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Badge,
  Button,
  CopyValue,
  Field,
  IconButton,
  Row,
  RowList,
  Section,
  Select,
  Skeleton,
} from '@/components/kit'

/**
 * Project access.
 *
 * Invites are single use and expire in seven days, and the copy says so at the
 * point of creation rather than in a tooltip afterwards. The two roles differ
 * in a way that matters, so each is described by what it lets someone do, not
 * by its name.
 */
export default function ProjectCollaboration({ projectId }: { projectId: Id<'projects'> }) {
  const access = useQuery(api.collaboration.listAccess, { projectId })
  const createInvite = useMutation(api.collaboration.createInvite)
  const revokeInvite = useMutation(api.collaboration.revokeInvite)
  const removeMember = useMutation(api.collaboration.removeMember)
  const updateMemberRole = useMutation(api.collaboration.updateMemberRole)

  const [role, setRole] = React.useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = React.useState(false)

  if (access === undefined) {
    return (
      <Section title="Access" description="Who can open this project.">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Section>
    )
  }

  // Null means the caller does not own the project, so access management is
  // not theirs to see at all.
  if (access === null) return null

  const invite = async () => {
    setBusy(true)
    try {
      const inviteId = await createInvite({ projectId, role })
      const url = `${window.location.origin}/invite/${inviteId}`
      await navigator.clipboard.writeText(url)
      toast.success('Invite link copied', { description: 'Single use, expires in seven days' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create that invite')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Access"
      description="Only you can manage this. An editor can change files, run builds, and deploy. A viewer can read everything and change nothing."
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Invite someone as" className="w-48">
          <Select value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}>
            <option value="editor">An editor</option>
            <option value="viewer">A viewer</option>
          </Select>
        </Field>
        <Button intent="primary" busy={busy} onClick={() => void invite()}>
          <Link2 className="size-3.5" />
          Create an invite link
        </Button>
      </div>

      {access.invites.length > 0 && (
        <div className="mt-6">
          <p className="key mb-2">Unused invites</p>
          <RowList>
            {access.invites.map((entry) => (
              <Row key={entry._id}>
                <Badge tone="neutral">{entry.role}</Badge>
                <div className="min-w-0 flex-1">
                  <CopyValue
                    value={`${typeof window === 'undefined' ? '' : window.location.origin}/invite/${entry._id}`}
                    label="the invite link"
                  />
                  <p className="tabular mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Expires{' '}
                    <time dateTime={new Date(entry.expiresAt).toISOString()}>
                      {new Date(entry.expiresAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </p>
                </div>
                <IconButton
                  label="Revoke this invite"
                  size="sm"
                  intent="danger"
                  onClick={() => void revokeInvite({ projectId, inviteId: entry._id })}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </Row>
            ))}
          </RowList>
        </div>
      )}

      {access.members.length > 0 && (
        <div className="mt-6">
          <p className="key mb-2">People with access</p>
          <RowList>
            {access.members.map((member) => (
              <Row key={member._id}>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{member.userId}</code>
                <label className="sr-only" htmlFor={`role-${member._id}`}>
                  Role for {member.userId}
                </label>
                <Select
                  id={`role-${member._id}`}
                  value={member.role}
                  onChange={(event) =>
                    void updateMemberRole({
                      projectId,
                      memberId: member._id,
                      role: event.target.value as 'editor' | 'viewer',
                    })
                  }
                  className="w-28"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </Select>
                <IconButton
                  label={`Remove ${member.userId}`}
                  size="sm"
                  intent="danger"
                  onClick={() => void removeMember({ projectId, memberId: member._id })}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </Row>
            ))}
          </RowList>
        </div>
      )}
    </Section>
  )
}
