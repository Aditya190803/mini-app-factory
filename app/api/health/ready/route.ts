import { api } from '@/convex/_generated/api'
import { getPublicConvexClient } from '@/lib/convex-server'

/**
 * Readiness: can this instance actually serve users? /api/health only proves the process is up.
 * This checks that Convex answers and the secret-box key is configured. Shared AI keys are
 * optional because deployments may use only account BYOK settings.
 */
export const dynamic = 'force-dynamic'

async function convexReachable() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3_000)
  try {
    // A public, anonymous query that returns null for a name that cannot exist.
    await Promise.race([
      getPublicConvexClient().query(api.projects.getPublishedProject, { projectName: '__readiness__' }),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const checks = {
    convex: await convexReachable(),
    secretKey: (process.env.INTEGRATION_TOKEN_SECRET?.length ?? 0) >= 32,
  }
  const ok = Object.values(checks).every(Boolean)
  return Response.json({ ok, checks }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
