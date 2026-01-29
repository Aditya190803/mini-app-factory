import { getProject } from '@/lib/projects';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const project = await getProject(name);

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  return Response.json(project);
}
