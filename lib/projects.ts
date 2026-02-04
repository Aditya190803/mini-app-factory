import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

import { ProjectFile } from "./page-builder";

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
  isMultiPage?: boolean;
  pageCount?: number;
  description?: string;
  selectedModel?: string;
  providerId?: string;
  favicon?: string;
  deploymentUrl?: string;
  repoUrl?: string;
  deployProvider?: string;
  deployedAt?: number;
  netlifySiteName?: string;
  globalSeo?: {
    siteName?: string;
    description?: string;
    ogImage?: string;
  };
  seoData?: Array<{ path: string, title?: string, description?: string, ogImage?: string }>;
  files?: ProjectFile[];
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
    isMultiPage: metadata.isMultiPage,
    pageCount: metadata.pageCount,
    description: metadata.description,
    selectedModel: metadata.selectedModel,
    providerId: metadata.providerId,
    deploymentUrl: metadata.deploymentUrl,
    repoUrl: metadata.repoUrl,
    deployProvider: metadata.deployProvider,
    deployedAt: metadata.deployedAt,
    netlifySiteName: metadata.netlifySiteName,
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
    isMultiPage: project.isMultiPage,
    pageCount: project.pageCount,
    description: project.description,
    selectedModel: project.selectedModel,
    providerId: project.providerId,
    favicon: project.favicon,
    deploymentUrl: project.deploymentUrl,
    repoUrl: project.repoUrl,
    deployProvider: project.deployProvider,
    deployedAt: project.deployedAt,
    netlifySiteName: project.netlifySiteName,
    seoData: project.seoData,
  };
}

export async function getFiles(projectName: string) {
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return [];
  return await convex.query(api.files.getFilesByProject, { projectId: project._id });
}

export async function getFile(projectName: string, path: string) {
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return null;
  return await convex.query(api.files.getFileByPath, { projectId: project._id, path });
}

export async function saveFiles(projectName: string, files: ProjectFile[]) {
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error("Project not found");
  await convex.mutation(api.files.saveFiles, {
    projectId: project._id,
    files
  });
}
