import { api } from "@/convex/_generated/api";
import { normalizeProjectMetadata, projectFileRecordSchema, type ProjectMetadata } from "./project-metadata";
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

export type { ProjectMetadata };

export interface PublishedProjectMetadata {
  name: string;
  isPublished: true;
  html?: string;
  favicon?: string;
  globalSeo?: ProjectMetadata['globalSeo'];
  seoData?: ProjectMetadata['seoData'];
}

function toProjectMetadata(record: unknown): ProjectMetadata {
  return normalizeProjectMetadata(record);
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
  target?: 'static' | 'edge';
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

/** Owner-only: the encrypted Cloudflare env var blob. Never part of `getProject`. */
export async function getProjectCloudflareEnvVars(projectName: string): Promise<string | null> {
  const convex = await getConvex();
  return await convex.query(api.projects.getProjectCloudflareEnvVars, { projectName });
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

/** Files plus the filesVersion they were read at, from one consistent read. */
export async function getFilesSnapshot(projectName: string) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) return null;
  const snapshot = await convex.query(api.files.getFilesSnapshot, { projectId: project._id });
  if (!snapshot) return null;
  return {
    files: snapshot.files.map((file) => projectFileRecordSchema.parse(file)),
    filesVersion: snapshot.filesVersion,
  };
}

/**
 * Replace the project's files. Pass `expectedVersion` when the files were derived from an earlier
 * read: the save is then rejected if anything else wrote in between, instead of overwriting it.
 */
export async function saveFiles(projectName: string, files: ProjectFile[], expectedVersion?: number) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error("Project not found");
  const result = await convex.mutation(api.files.saveFiles, {
    projectId: project._id,
    files,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  });
  return result.filesVersion;
}

export async function createProjectVersion(projectName: string, summary: string, files: ProjectFile[]) {
  const convex = await getConvex();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error('Project not found');
  await convex.mutation(api.conversations.createVersion, {
    projectId: project._id,
    summary: summary.slice(0, 240),
    filesJson: JSON.stringify(files),
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
