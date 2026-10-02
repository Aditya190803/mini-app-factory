import type { Instrumentation } from 'next'

/** Fail at boot on a broken environment, instead of on the first request that needs it. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getServerEnv } = await import('@/lib/env')
    getServerEnv()
  }
}

/** Every server error Next.js captures (renders, route handlers, actions) goes to the reporter. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import('@/lib/error-reporting')
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined
  await reportError(error, {
    source: `request:${context.routeType}`,
    path: `${request.method} ${request.path.split('?')[0]}`,
    route: context.routePath,
    digest,
  })
}
