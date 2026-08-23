import { canUserEditProject } from '@/lib/project-access';
import { getProject } from '@/lib/projects';
import ProjectView from '@/components/project-view';
import { notFound, redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';

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

  const user = await stackServerApp.getUser();
  if (!user) {
    redirect('/handler/sign-in');
  }

  if (!canUserEditProject(project, user.id)) {
    notFound();
  }

  return (
    <main className="min-h-dvh">
      <ProjectView projectName={projectName} initialProject={project} />
    </main>
  );
}
