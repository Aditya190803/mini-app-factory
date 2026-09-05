'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button, EmptyState } from '@/components/kit'
import { TriangleAlert } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6"
    >
      <div className="w-full max-w-md">
        <EmptyState
          title="This page did not load"
          icon={<TriangleAlert className="size-5" />}
          action={
            <div className="flex gap-2">
              <Button intent="primary" onClick={reset}>
                Try again
              </Button>
              <Button asChild>
                <Link href="/">Back to the composer</Link>
              </Button>
            </div>
          }
        >
          <p>Retrying usually fixes it. Nothing you had saved is affected.</p>
          {/* The digest is the only handle support has on a specific failure,
              so it is shown rather than swallowed. */}
          {error.digest && (
            <p className="mt-3 font-mono text-xs text-[var(--muted-foreground)]">
              reference {error.digest}
            </p>
          )}
        </EmptyState>
      </div>
    </main>
  )
}
