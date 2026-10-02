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

export type ProjectRole = 'owner' | 'editor' | 'viewer';

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function roleAtLeast(role: ProjectRole | null, min: ProjectRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * The caller's role on `project`, or null for no access.
 *
 * Projects with no owner are legacy rows. They used to be claimable by anyone signed in; now they
 * are inaccessible until an admin assigns an owner with `projects.assignOrphanOwner`.
 */
export async function getProjectRole(
  ctx: QueryCtx | MutationCtx,
  project: Doc<'projects'> | null,
  userId: string | null
): Promise<ProjectRole | null> {
  if (!project || !userId || !project.userId) return null;
  if (project.userId === userId) return 'owner';
  const member = await ctx.db
    .query('projectMembers')
    .withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', userId))
    .first();
  return member?.role ?? null;
}

async function loadWithRole(
  ctx: QueryCtx | MutationCtx,
  project: Doc<'projects'> | null,
  min: ProjectRole
): Promise<Doc<'projects'>> {
  const userId = await requireUserId(ctx);
  if (!project) throw new Error('Project not found');
  if (!roleAtLeast(await getProjectRole(ctx, project, userId), min)) throw new Error('Unauthorized');
  return project;
}

/** Load a project by name and assert the caller has at least `min` role on it. */
export async function requireProjectRole(
  ctx: QueryCtx | MutationCtx,
  projectName: string,
  min: ProjectRole
): Promise<Doc<'projects'>> {
  const project = await ctx.db
    .query('projects')
    .withIndex('by_projectName', (q) => q.eq('projectName', projectName))
    .first();
  return loadWithRole(ctx, project, min);
}

/** Same, by document id — for the file/deployment tables, which key off projectId. */
export async function requireProjectRoleById(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<'projects'>,
  min: ProjectRole
): Promise<Doc<'projects'>> {
  return loadWithRole(ctx, await ctx.db.get(projectId), min);
}

/** Editor-or-owner access by name. */
export function requireProjectAccess(ctx: QueryCtx | MutationCtx, projectName: string) {
  return requireProjectRole(ctx, projectName, 'editor');
}

/** Editor-or-owner access by id. */
export function requireProjectAccessById(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>) {
  return requireProjectRoleById(ctx, projectId, 'editor');
}

/** Any-member access by id. */
export function requireProjectReadAccessById(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>) {
  return requireProjectRoleById(ctx, projectId, 'viewer');
}
