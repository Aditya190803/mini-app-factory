import type { ProjectMetadata } from '@/lib/projects';

/** Whether the signed-in user may mutate this project. */
export function canUserEditProject(project: Pick<ProjectMetadata, 'userId'>, userId: string): boolean {
  return !project.userId || project.userId === userId;
}

/** True when project exists but has no owner yet (first authenticated edit can claim). */
export function isOrphanProject(project: Pick<ProjectMetadata, 'userId'>): boolean {
  return !project.userId;
}

export type ProjectAccessDenied = { ok: false; status: 401 | 403 | 404; message: string };

/** Server/route guard: auth + ownership (orphan projects allowed until claimed). */
export function assertCanAccessProject<T extends Pick<ProjectMetadata, 'userId'>>(
  project: T | null,
  userId: string | undefined
): { ok: true; project: T } | ProjectAccessDenied {
  if (!userId) {
    return { ok: false, status: 401, message: 'Authentication required' };
  }
  if (!project) {
    return { ok: false, status: 404, message: 'Project not found' };
  }
  if (!canUserEditProject(project, userId)) {
    return { ok: false, status: 403, message: 'Unauthorized to access this project' };
  }
  return { ok: true, project };
}