import { getProject } from '@/lib/projects';
import { assertCanAccessProject } from '@/lib/project-access';
import { stackServerApp } from '@/stack/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const requestId = crypto.randomUUID();
  const user = await stackServerApp.getUser();
  const { name } = await params;
  const project = await getProject(name);

  const access = assertCanAccessProject(project, user?.id);
  if (!access.ok) {
    return Response.json(
      { error: access.message, code: access.status === 401 ? 'UNAUTHORIZED' : access.status === 404 ? 'PROJECT_NOT_FOUND' : 'FORBIDDEN', requestId },
      { status: access.status }
    );
  }

  return Response.json(access.project);
}