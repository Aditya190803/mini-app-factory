'use client'

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { useUser } from '@stackframe/stack'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button, EmptyState, Spinner } from '@/components/kit'

/**
 * Accepting a project invitation.
 *
 * The mutation is fired once, guarded by a ref, because it consumes a use from
 * the invite: a double invocation in development strict mode would burn one
 * silently.
 */
export default function InvitePage() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const user = useUser()
  const router = useRouter()
  const accept = useMutation(api.collaboration.acceptInvite)
  const started = React.useRef(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!user || started.current) return
    started.current = true
    void accept({ inviteId: inviteId as Id<'projectInvites'> })
      .then(({ projectName }) => router.replace(`/edit/${projectName}`))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'This invitation could not be accepted')
      )
  }, [accept, inviteId, router, user])

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

  if (error) {
    return (
      <main id="main" className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-md">
          <EmptyState
            title="This invitation is not usable"
            action={
              <Button asChild>
                <a href="/dashboard">Back to your projects</a>
              </Button>
            }
          >
            <p>{error}</p>
            <p className="mt-2">
              It may have expired, been revoked, or already been used the maximum number of times.
            </p>
          </EmptyState>
        </div>
      </main>
    )
  }

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]" role="status">
        <Spinner />
        Adding you to the project
      </div>
    </main>
  )
}
