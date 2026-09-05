'use client'

import { useEffect } from 'react'
import Link from 'next/link'

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
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <h1 className="text-lg font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page failed to load. Trying again usually fixes it.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-[var(--primary-hover)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}
