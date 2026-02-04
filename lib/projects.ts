import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

import { ProjectFile } from "./page-builder";

// Lazy-initialize the convex client to avoid errors when running tests
let _convex: ConvexHttpClient | null = null;
function getConvex(): ConvexHttpClient {
  if (!_convex) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL environment variable is not set");
    }
    _convex = new ConvexHttpClient(url);
  }
  return _convex;
}

export interface ProjectMetadata {
  name: string;
  prompt: string;
  createdAt: number;
  updatedAt?: number;
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
  const project = await getConvex().query(api.projects.getProject, { projectName: name });
  return !!project;
}

export async function saveProject(metadata: ProjectMetadata) {
  await getConvex().mutation(api.projects.saveProject, {
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
  const project = await getConvex().query(api.projects.getProject, { projectName: name });
  if (!project) return null;
  
  return {
    name: project.projectName,
    prompt: project.prompt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
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
  const convex = getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return [];
  return await convex.query(api.files.getFilesByProject, { projectId: project._id });
}

export async function getFile(projectName: string, path: string) {
  const convex = getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return null;
  return await convex.query(api.files.getFileByPath, { projectId: project._id, path });
}

export async function saveFiles(projectName: string, files: ProjectFile[]) {
  const convex = getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error("Project not found");
  await convex.mutation(api.files.saveFiles, {
    projectId: project._id,
    files
  });
}
