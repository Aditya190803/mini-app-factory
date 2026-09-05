import 'server-only';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getAuthedConvexClient } from '@/lib/convex-server';

async function resolveProject(projectName: string) {
  const convex = await getAuthedConvexClient();
  const project = await convex.query(api.projects.getProject, { projectName });
  if (!project) throw new Error('Project not found');
  return { convex, project };
}

export async function createProjectRun(projectName: string, kind: 'initial' | 'build' | 'discuss' | 'repair', prompt: string) {
  const { convex, project } = await resolveProject(projectName);
  const runId = await convex.mutation(api.conversations.createRun, { projectId: project._id, kind, prompt });
  return { runId, projectId: project._id };
}

export async function appendProjectRunEvent(params: {
  projectId: Id<'projects'>;
  runId: Id<'generationRuns'>;
  type: string;
  message: string;
  path?: string;
  detailsJson?: string;
}) {
  const convex = await getAuthedConvexClient();
  await convex.mutation(api.conversations.appendRunEvent, params);
}

export async function finishProjectRun(params: {
  projectId: Id<'projects'>;
  runId: Id<'generationRuns'>;
  status: 'completed' | 'failed' | 'cancelled';
  errorCode?: string;
  errorMessage?: string;
}) {
  const convex = await getAuthedConvexClient();
  await convex.mutation(api.conversations.finishRun, params);
}

export async function appendProjectMessage(projectName: string, role: 'user' | 'assistant' | 'system', content: string, status: 'completed' | 'failed' = 'completed', detailsJson?: string) {
  const { convex, project } = await resolveProject(projectName);
  return convex.mutation(api.conversations.appendMessage, { projectId: project._id, role, content, status, detailsJson });
}

export async function cancelProjectRun(projectName: string, runId: Id<'generationRuns'>) {
  const { convex, project } = await resolveProject(projectName);
  await convex.mutation(api.conversations.cancelRun, { projectId: project._id, runId });
}

export async function isProjectRunCancelled(projectId: Id<'projects'>, runId: Id<'generationRuns'>) {
  const convex = await getAuthedConvexClient();
  return await convex.query(api.conversations.getRunStatus, { projectId, runId }) === 'cancelled';
}

export async function createProjectVersion(projectName: string, summary: string, filesJson: string, messageId?: Id<'projectMessages'>) {
  const { convex, project } = await resolveProject(projectName);
  return convex.mutation(api.conversations.createVersion, { projectId: project._id, summary, filesJson, messageId });
}
