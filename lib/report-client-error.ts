/** Send an error caught by a React error boundary to the server. Best effort, never throws. */
export function reportClientError(error: Error & { digest?: string }, boundary: 'page' | 'global') {
  try {
    const body = JSON.stringify({
      message: (error.message || 'Unknown error').slice(0, 1_000),
      digest: error.digest,
      path: window.location.pathname.slice(0, 500),
      boundary,
    })
    if (navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))) return
    void fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
  } catch {
    // Reporting is best effort.
  }
}
