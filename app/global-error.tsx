'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/report-client-error'

/**
 * Replaces the root layout when it fails, so it cannot use the app's providers, fonts or global
 * CSS; the styles here are inline and follow the OS colour scheme.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    reportClientError(error, 'global')
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'light dark',
          padding: '1.5rem',
        }}
      >
        <title>Something went wrong · Mini App Factory</title>
        <main style={{ maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>The app did not load</h1>
          <p style={{ margin: '0 0 1rem', opacity: 0.8 }}>
            Retrying usually fixes it. Nothing you had saved is affected.
          </p>
          {error.digest && (
            <p style={{ margin: '0 0 1rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', opacity: 0.7 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
