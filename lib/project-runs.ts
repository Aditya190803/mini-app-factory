import 'server-only';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { AIUsage } from '@/lib/ai-usage';
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

/**
 * An event writer that preserves order. Events used to be written fire-and-forget, so two in
 * flight at once could commit out of order and the persisted feed disagreed with the live one.
 * Failures are logged and never break the run.
 */
export function createRunEventWriter(projectId: Id<'projects'>, runId: Id<'generationRuns'>, label: string) {
  let tail: Promise<void> = Promise.resolve();
  const write = (type: string, message: string, path?: string) => {
    tail = tail
      .then(() => appendProjectRunEvent({ projectId, runId, type, message, path }))
      .catch((error) => console.error(`[${label}] failed to persist run event:`, error));
  };
  return { write, flush: () => tail };
}

export async function finishProjectRun(params: {
  projectId: Id<'projects'>;
  runId: Id<'generationRuns'>;
  status: 'completed' | 'failed' | 'cancelled';
  errorCode?: string;
  errorMessage?: string;
  usage?: AIUsage;
}) {
  const convex = await getAuthedConvexClient();
  const { usage, ...rest } = params;
  await convex.mutation(api.conversations.finishRun, {
    ...rest,
    ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model: usage.model } : {}),
  });
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

/**
 * Abort `controller` when the run is cancelled from another request (the Stop button). Model calls
 * receive the controller's signal, so cancelling now stops the in-flight call and its billing
 * instead of waiting for it to finish. Returns a function that stops watching.
 */
export function watchRunCancellation(
  projectId: Id<'projects'>,
  runId: Id<'generationRuns'>,
  controller: AbortController,
  intervalMs = 3_000
) {
  const timer = setInterval(() => {
    void isProjectRunCancelled(projectId, runId)
      .then((cancelled) => { if (cancelled) controller.abort(); })
      .catch(() => undefined);
  }, intervalMs);
  controller.signal.addEventListener('abort', () => clearInterval(timer), { once: true });
  return () => clearInterval(timer);
}

export async function createProjectVersion(projectName: string, summary: string, filesJson: string, messageId?: Id<'projectMessages'>) {
  const { convex, project } = await resolveProject(projectName);
  return convex.mutation(api.conversations.createVersion, { projectId: project._id, summary, filesJson, messageId });
}
