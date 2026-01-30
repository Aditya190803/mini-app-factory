import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface ProjectMetadata {
  name: string;
  prompt: string;
  createdAt: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  html?: string;
  error?: string;
  isPublished?: boolean;
  userId?: string;
}

export async function projectExists(name: string): Promise<boolean> {
  const project = await convex.query(api.projects.getProject, { projectName: name });
  return !!project;
}

export async function saveProject(metadata: ProjectMetadata) {
  await convex.mutation(api.projects.saveProject, {
    projectName: metadata.name,
    prompt: metadata.prompt,
    html: metadata.html,
    status: metadata.status,
    isPublished: metadata.isPublished ?? false,
    userId: metadata.userId,
  });
}

export async function getProject(name: string): Promise<ProjectMetadata | null> {
  const project = await convex.query(api.projects.getProject, { projectName: name });
  if (!project) return null;
  
  return {
    name: project.projectName,
    prompt: project.prompt,
    createdAt: new Date(project.createdAt).toISOString(),
    status: project.status as ProjectMetadata['status'],
    html: project.html,
    isPublished: project.isPublished,
    userId: project.userId,
  };
}
