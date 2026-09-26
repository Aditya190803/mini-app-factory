/**
 * Liveness for uptime monitors and load balancers. Deliberately touches no
 * dependency: a Convex or AI provider outage should show up in those
 * services' own status, not take the whole app out of rotation.
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    { ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
