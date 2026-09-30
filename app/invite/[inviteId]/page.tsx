'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { useUser } from '@stackframe/stack'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button, EmptyState, Spinner } from '@/components/kit'

/**
 * Accepting a project invitation.
 *
 * Acceptance needs an explicit click. It used to fire on page load, so any page that could get a
 * signed-in user to open an invite link (an <img>, a redirect) silently added them to a project
 * of the sender's choosing.
 */
export default function InvitePage() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const user = useUser()
  const router = useRouter()
  const accept = useMutation(api.collaboration.acceptInvite)
  const invite = useQuery(api.collaboration.getInvite, user ? { inviteId } : 'skip')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')

  const onAccept = async () => {
    setPending(true)
    try {
      const { projectName } = await accept({ inviteId: inviteId as Id<'projectInvites'> })
      router.replace(`/edit/${projectName}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This invitation could not be accepted')
      setPending(false)
    }
  }

  if (!user) {
    return (
      <main id="main" className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-md">
          <EmptyState
            title="Sign in to join this project"
            action={
              <Button
                intent="primary"
                onClick={() =>
                  router.push(
                    `/handler/sign-in?after_auth_return_to=${encodeURIComponent(`/invite/${inviteId}`)}`
                  )
                }
              >
                Sign in
              </Button>
            }
          >
            <p>An invitation is bound to the account that accepts it, so it needs one first.</p>
          </EmptyState>
        </div>
      </main>
    )
  }

  if (error || invite === null) {
    return (
      <main id="main" className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-md">
          <EmptyState
            title="This invitation is not usable"
            action={
              <Button asChild>
                <a href="/projects">Back to your projects</a>
              </Button>
            }
          >
            {error && <p>{error}</p>}
            <p className="mt-2">
              It may have expired, been revoked, or already been used the maximum number of times.
            </p>
          </EmptyState>
        </div>
      </main>
    )
  }

  if (invite === undefined) {
    return (
      <main id="main" className="grid min-h-dvh place-items-center px-6">
        <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]" role="status">
          <Spinner />
          Checking the invitation
        </div>
      </main>
    )
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md">
        <EmptyState
          title={`Join ${invite.projectName}?`}
          action={
            <div className="flex gap-2">
              <Button intent="primary" onClick={onAccept} disabled={pending}>
                {pending ? <Spinner /> : null}
                Accept as {invite.role}
              </Button>
              <Button asChild>
                <a href="/projects">Not now</a>
              </Button>
            </div>
          }
        >
          <p>
            You were invited as {invite.role === 'editor' ? 'an editor, so you can change its files and run builds' : 'a viewer, so you can read it but not change it'}.
          </p>
        </EmptyState>
      </div>
    </main>
  )
}
