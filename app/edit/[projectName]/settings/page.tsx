import { getProject } from '@/lib/projects';
import ProjectSettings from '@/components/project-settings';
import { notFound, redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';

interface PageProps {
  params: {
    projectName: string;
  };
}

export default async function ProjectSettingsPage({ params }: PageProps) {
  const { projectName } = await params;
  const project = await getProject(projectName);

  if (!project) {
    notFound();
  }

  const user = await stackServerApp.getUser();
  if (!user) {
    redirect('/handler/sign-in');
  }

  if (project.userId && project.userId !== user.id) {
    notFound();
  }

  return (
    <main className="min-h-screen">
      <ProjectSettings projectName={projectName} />
    </main>
  );
}
