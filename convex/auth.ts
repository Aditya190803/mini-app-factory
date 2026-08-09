import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx, MutationCtx } from './_generated/server';

/**
 * Identity helpers for Convex handlers.
 *
 * The rule these enforce: a handler must never take `userId` as an argument and trust it. The
 * Convex deployment URL is public, so any argument is attacker-controlled — ownership has to come
 * from the verified JWT that `ctx.auth` exposes. See convex/auth.config.ts for the provider setup.
 */

/** The signed-in user's id, or null when the request carries no valid token. */
export async function getUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  // Stack Auth puts the user id in `subject`.
  return identity.subject;
}

/** The signed-in user's id, throwing when unauthenticated. Use in handlers that require a user. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

/**
 * Admin gate, mirroring lib/admin-access.ts on the Next.js side.
 *
 * Needs MAF_ADMIN_EMAILS set on the Convex deployment as well as in the app environment:
 *
 *   npx convex env set MAF_ADMIN_EMAILS you@example.com
 *
 * Fails closed when unset, and requires a verified email — an allowlisted but unverified address
 * would otherwise let anyone who can register with it take over the global model config.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<{
  userId: string;
  email: string;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error('Not authenticated');
  }

  const allowlist = (process.env.MAF_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (identity.email ?? '').trim().toLowerCase();

  if (allowlist.length === 0 || !email || identity.emailVerified !== true) {
    throw new Error('Forbidden');
  }
  if (!allowlist.includes(email)) {
    throw new Error('Forbidden');
  }

  return { userId: identity.subject, email };
}

/**
 * Whether `userId` may read/write `project`.
 *
 * Mirrors `assertCanAccessProject` in lib/project-access.ts: the owner, or anyone signed in when
 * the project has no owner at all.
 *
 * The orphan branch is legacy-only and deliberately retained for now. Projects can no longer be
 * created without an owner — `saveProject` takes the id from the token — so the only rows that can
 * still match it predate this change. Removing the branch outright would strand those rows, so the
 * correct sequence is: backfill `userId` (see `backfillProjectOwners`), then delete this branch.
 * Until then any signed-in user can still reach an un-owned legacy project, which is the residual
 * part of that finding.
 */
export function canAccessProject(
  project: Doc<'projects'> | null,
  userId: string | null
): boolean {
  if (!project) return false;
  if (!userId) return false;
  return !project.userId || project.userId === userId;
}

/** Load a project by name and assert the caller may use it. Throws otherwise. */
export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectName: string
): Promise<Doc<'projects'>> {
  const userId = await requireUserId(ctx);
  const project = await ctx.db
    .query('projects')
    .withIndex('by_projectName', (q) => q.eq('projectName', projectName))
    .first();

  if (!project) throw new Error('Project not found');
  if (!canAccessProject(project, userId)) throw new Error('Unauthorized');
  return project;
}

/** Same, by document id — for the file/deployment tables, which key off projectId. */
export async function requireProjectAccessById(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<'projects'>
): Promise<Doc<'projects'>> {
  const userId = await requireUserId(ctx);
  const project = await ctx.db.get(projectId);

  if (!project) throw new Error('Project not found');
  if (!canAccessProject(project, userId)) throw new Error('Unauthorized');
  return project;
}
