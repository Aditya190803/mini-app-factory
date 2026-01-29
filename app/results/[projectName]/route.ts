import { getProject } from '@/lib/projects';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectName: string }> }
) {
  const { projectName } = await params;
  const project = await getProject(projectName);

  if (!project || !project.isPublished || !project.html) {
    return new NextResponse('Project not found or not published', { status: 404 });
  }

  // Set the correct content type to render as HTML
  return new NextResponse(project.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
