import { getProject } from '@/lib/projects';
import ProjectView from '@/components/project-view';
import { notFound } from 'next/navigation';

interface PageProps {
  params: {
    projectName: string;
  };
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectName } = await params;
  const project = await getProject(projectName);

  if (!project) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <ProjectView projectName={projectName} initialProject={project} />
    </main>
  );
}
