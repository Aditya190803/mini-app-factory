import { getProject } from '@/lib/projects';
import ProjectView from '@/components/project-view';
import { notFound, redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';
import type { Metadata } from 'next';

interface PageProps {
  params: {
    projectName: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectName } = await params;
  return {
    title: `Edit ${decodeURIComponent(projectName)} — Mini App Factory`,
    description: `Edit and refine your "${decodeURIComponent(projectName)}" project.`,
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

  if (project.userId && project.userId !== user.id) {
    // If it's someone else's project, don't let them edit
    notFound(); 
  }

  return (
    <main className="min-h-screen">
      <ProjectView projectName={projectName} initialProject={project} />
    </main>
  );
}
