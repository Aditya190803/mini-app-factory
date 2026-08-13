import { api } from "@/convex/_generated/api";
import { normalizeProjectMetadata, projectFileRecordSchema } from "./project-metadata";
import { getAuthedConvexClient, getPublicConvexClient } from "./convex-server";

import { ProjectFile } from "./page-builder";

/**
 * Server-side project access.
 *
 * Convex now derives ownership from the request's identity, so these helpers carry the caller's
 * token (`getConvex`). The `*Published*` variants below are the deliberate exception: they use an
 * anonymous client and may only call Convex functions that enforce `isPublished` themselves. They
 * exist for `/results/*`, which serves published sites to logged-out visitors.
 */
const getConvex = getAuthedConvexClient;

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
  referenceUrl?: string;
  projectInstructions?: string;
  selectedModel?: string;
  providerId?: string;
  favicon?: string;
  deploymentUrl?: string;
  repoUrl?: string;
  deployProvider?: string;
  deployedAt?: number;
  netlifySiteName?: string;
  cloudflareProjectName?: string;
  cloudflareDeploymentId?: string;
  cloudflareD1DatabaseId?: string;
  cloudflareD1DatabaseName?: string;
  cloudflareCustomDomain?: string;
  cloudflareEnvVarsEncrypted?: string;
  cloudflareResourcesJson?: string;
  cloudflarePreviewProjectName?: string;
  cloudflarePreviewDeploymentId?: string;
  cloudflarePreviewUrl?: string;
  cloudflarePreviewResourcesJson?: string;
  cloudflarePreviewExpiresAt?: number;
  globalSeo?: {
    siteName?: string;
    description?: string;
    ogImage?: string;
  };
  seoData?: Array<{ path: string, title?: string, description?: string, ogImage?: string }>;
  files?: ProjectFile[];
}

export interface PublishedProjectMetadata {
  name: string;
  isPublished: true;
  html?: string;
  favicon?: string;
  globalSeo?: ProjectMetadata['globalSeo'];
  seoData?: ProjectMetadata['seoData'];
}

export function toProjectMetadata(record: unknown): ProjectMetadata {
  return normalizeProjectMetadata(record) as ProjectMetadata;
}

export async function projectExists(name: string): Promise<boolean> {
  const convex = await getConvex();
  return await convex.query(api.projects.projectNameTaken, { projectName: name });
}

/**
 * Reserve a name and create the project row in one mutation.
 *
 * Returns false when the name is already taken. Replaces the previous check-then-insert pair,
 * where two concurrent requests could both pass the check and both insert.
 */
export async function reserveProjectName(params: {
  projectName: string;
  prompt: string;
  description?: string;
  referenceUrl?: string;
  selectedModel?: string;
  providerId?: string;
}): Promise<boolean> {
  const convex = await getConvex();
  const id = await convex.mutation(api.projects.reserveProjectName, params);
  return id !== null;
}

export async function saveProject(metadata: ProjectMetadata) {
  const convex = await getConvex();
  await convex.mutation(api.projects.saveProject, {
    projectName: metadata.name,
    prompt: metadata.prompt,
    html: metadata.html,
    status: metadata.status,
    isPublished: metadata.isPublished ?? false,
    isMultiPage: metadata.isMultiPage,
    pageCount: metadata.pageCount,
    description: metadata.description,
    referenceUrl: metadata.referenceUrl,
    selectedModel: metadata.selectedModel,
    providerId: metadata.providerId,
    deploymentUrl: metadata.deploymentUrl,
    repoUrl: metadata.repoUrl,
    deployProvider: metadata.deployProvider,
    deployedAt: metadata.deployedAt,
    netlifySiteName: metadata.netlifySiteName,
  });
}

export async function updateCloudflareProjectConfig(params: {
  projectName: string;
  cloudflareProjectName?: string | null;
  cloudflareDeploymentId?: string | null;
  cloudflareD1DatabaseId?: string | null;
  cloudflareD1DatabaseName?: string | null;
  cloudflareCustomDomain?: string | null;
  cloudflareEnvVarsEncrypted?: string | null;
  cloudflareResourcesJson?: string | null;
  deploymentUrl?: string | null;
  cloudflarePreviewProjectName?: string | null;
  cloudflarePreviewDeploymentId?: string | null;
  cloudflarePreviewUrl?: string | null;
  cloudflarePreviewResourcesJson?: string | null;
  cloudflarePreviewExpiresAt?: number | null;
}) {
  const convex = await getConvex();
  await convex.mutation(api.projects.updateCloudflareConfig, params);
}

export async function getProject(name: string): Promise<ProjectMetadata | null> {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName: name });
  if (!project) return null;

  return toProjectMetadata(project);
}

export async function getUserProjects(): Promise<ProjectMetadata[]> {
  const convex = await getConvex();
  const projects = await convex.query(api.projects.getUserProjects, {});
  return projects.map((project) => toProjectMetadata(project));
}

export async function getFiles(projectName: string) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return [];
  const files = await convex.query(api.files.getFilesByProject, { projectId: project._id });
  return files.map((file) => projectFileRecordSchema.parse(file));
}

export async function getFile(projectName: string, path: string) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return null;
  return await convex.query(api.files.getFileByPath, { projectId: project._id, path });
}

export async function claimProjectOrphan(projectName: string) {
  const convex = await getConvex();
  await convex.mutation(api.projects.claimProjectOrphan, { projectName });
}

export async function saveFiles(projectName: string, files: ProjectFile[]) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error("Project not found");
  await convex.mutation(api.files.saveFiles, {
    projectId: project._id,
    files
  });
}

// --- Public (unauthenticated) reads, for serving published sites at /results/* ---

export async function getPublishedProject(name: string): Promise<PublishedProjectMetadata | null> {
  const project = await getPublicConvexClient().query(api.projects.getPublishedProject, {
    projectName: name,
  });
  if (!project) return null;
  return {
    name: project.projectName,
    isPublished: true,
    html: project.html,
    favicon: project.favicon,
    globalSeo: project.globalSeo,
    seoData: project.seoData,
  };
}

export async function getPublishedFiles(projectName: string) {
  const files = await getPublicConvexClient().query(api.files.getPublishedFiles, { projectName });
  return files.map((file) => projectFileRecordSchema.parse(file));
}

export async function getPublishedFile(projectName: string, path: string) {
  return await getPublicConvexClient().query(api.files.getPublishedFile, { projectName, path });
}
