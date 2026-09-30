import { getProject, type ProjectMetadata } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';

/**
 * Project authorization for routes and pages.
 *
 * The role comes from Convex (`getProject` returns `accessRole`, derived from the verified token),
 * so this module only compares it against what an operation needs. Every route and page goes
 * through `assertProjectRole` / `requireProjectRole`; previously pages checked "owner only" while
 * several Cloudflare routes checked nothing, so editors got 404s and viewers reached teardown.
 *
 * What each role may do:
 * - viewer: read the project, its files, and its preview.
 * - editor: everything a viewer can, plus edit files, run builds, and deploy with their own tokens.
 * - owner:  everything, plus Cloudflare resources (which live in the owner's account), publishing,
 *           sharing, and deletion.
 */
export type ProjectRole = 'owner' | 'editor' | 'viewer';

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, editor: 2, owner: 3 };

export function hasProjectRole(role: ProjectRole | undefined, min: ProjectRole): boolean {
  return role !== undefined && ROLE_RANK[role] >= ROLE_RANK[min];
}

export type ProjectAccessDenied = { ok: false; status: 401 | 403 | 404; message: string };

/** Auth + role check on an already-loaded project. */
export function assertProjectRole<T extends Pick<ProjectMetadata, 'accessRole'>>(
  project: T | null,
  userId: string | undefined,
  min: ProjectRole
): { ok: true; project: T } | ProjectAccessDenied {
  if (!userId) {
    return { ok: false, status: 401, message: 'Authentication required' };
  }
  // Convex returns null for projects the caller has no role on, so "not found" and "not a member"
  // look the same from here — deliberately, so names of private projects are not confirmed.
  if (!project) {
    return { ok: false, status: 404, message: 'Project not found' };
  }
  if (!hasProjectRole(project.accessRole, min)) {
    return {
      ok: false,
      status: 403,
      message: min === 'owner' ? 'Only the project owner can do this' : 'You do not have permission to change this project',
    };
  }
  return { ok: true, project };
}

function errorCode(status: ProjectAccessDenied['status']) {
  return status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'PROJECT_NOT_FOUND' : 'FORBIDDEN';
}

/** Render a denial as the JSON error shape the API routes use. */
export function accessDeniedResponse(denied: ProjectAccessDenied, requestId?: string): Response {
  return Response.json(
    { error: denied.message, code: errorCode(denied.status), ...(requestId ? { requestId } : {}) },
    { status: denied.status }
  );
}

/**
 * Load the signed-in user and the project, and check the role, in one call.
 * Returns a ready-to-send Response on failure.
 */
export async function requireProjectRole(
  projectName: string,
  min: ProjectRole,
  requestId?: string
): Promise<
  | { ok: true; user: { id: string }; project: ProjectMetadata }
  | { ok: false; response: Response }
> {
  const user = await stackServerApp.getUser();
  if (!user) {
    return { ok: false, response: accessDeniedResponse({ ok: false, status: 401, message: 'Authentication required' }, requestId) };
  }
  const access = assertProjectRole(await getProject(projectName), user.id, min);
  if (!access.ok) return { ok: false, response: accessDeniedResponse(access, requestId) };
  return { ok: true, user, project: access.project };
}
