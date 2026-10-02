import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { accessDeniedResponse, assertProjectRole } from '@/lib/project-access';
import { getFiles, getProject } from '@/lib/projects';
import { AIRunStoppedError, getAIClient, usesOwnKeys } from '@/lib/ai-client';
import { getGlobalAdminModelConfig, getPersistedAISettings } from '@/lib/ai-settings-store';
import { appendProjectMessage, appendProjectRunEvent, createProjectRun, finishProjectRun } from '@/lib/project-runs';
import { isAIProviderId } from '@/lib/ai-admin-config';
import { aiQuotaBuckets, consumeRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { reportError } from '@/lib/error-reporting';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(12_000),
  modelId: z.string().trim().max(200).optional(),
  providerId: z.string().trim().max(50).optional(),
}).strict();

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const project = await getProject(parsed.data.projectName);
  const access = assertProjectRole(project, user.id, 'editor');
  if (!access.ok) return accessDeniedResponse(access);

  const [adminConfig, persisted] = await Promise.all([getGlobalAdminModelConfig(), getPersistedAISettings()]);
  const runtimeConfig = { adminConfig, byokConfig: persisted.byokConfig };
  const limit = await consumeRateLimit('discuss', user.id, aiQuotaBuckets(usesOwnKeys(runtimeConfig)));
  if (!limit.allowed) return rateLimitedResponse(limit);

  const { runId, projectId } = await createProjectRun(parsed.data.projectName, 'discuss', parsed.data.prompt);
  await appendProjectMessage(parsed.data.projectName, 'user', parsed.data.prompt);
  await appendProjectRunEvent({ projectId, runId, type: 'planning', message: 'Reviewing the project without changing files' });

  let usage;
  try {
    const files = await getFiles(parsed.data.projectName);
    const manifest = files.map((file) => `${file.path} (${file.fileType})`).join('\n');
    const focused = files
      .filter((file) => ['index.html', 'styles.css', 'app.js', 'script.js', '_worker.js', 'cloudflare.manifest.json', 'wrangler.jsonc'].includes(file.path))
      .map((file) => `\n--- ${file.path} ---\n${file.content}`)
      .join('')
      .slice(0, 80_000);
    const client = await getAIClient(runtimeConfig);
    const session = await client.createSession({
      // Left unset, the client falls back to the admin-configured default.
      model: parsed.data.modelId || undefined,
      providerId: isAIProviderId(parsed.data.providerId) ? parsed.data.providerId : undefined,
      systemMessage: { content: 'You are discussing an existing generated application. Answer clearly using the supplied project context. Do not claim to edit files, run commands, or deploy anything. Mention exact files when useful.' },
      // Stop in the editor aborts this request; the model call stops with it.
      signal: request.signal,
    });
    let content = '';
    try {
      const response = await session.sendAndWait({ prompt: `${project?.projectInstructions ? `Persistent project instructions:\n${project.projectInstructions}\n\n` : ''}Project files:\n${manifest}${focused}\n\nUser question:\n${parsed.data.prompt}`, maxOutputTokens: 2000 }, 90_000);
      content = response?.data?.content?.trim() || 'I could not produce an answer.';
    } finally {
      usage = session.usage?.();
      await session.destroy().catch(() => {});
    }
    await appendProjectMessage(parsed.data.projectName, 'assistant', content);
    await appendProjectRunEvent({ projectId, runId, type: 'completed', message: 'Discussion completed' });
    await finishProjectRun({ projectId, runId, status: 'completed', usage });
    return Response.json({ content, runId });
  } catch (error) {
    if (error instanceof AIRunStoppedError && request.signal.aborted) {
      await finishProjectRun({ projectId, runId, status: 'cancelled', usage }).catch(() => {});
      return Response.json({ error: 'Discussion cancelled', code: 'ABORTED' }, { status: 499 });
    }
    const message = error instanceof Error ? error.message : 'Discussion failed';
    await reportError(error, { source: 'discuss', project: parsed.data.projectName });
    await appendProjectMessage(parsed.data.projectName, 'system', `Discussion failed: ${message}`, 'failed').catch(() => {});
    await finishProjectRun({ projectId, runId, status: 'failed', errorCode: 'DISCUSS_ERROR', errorMessage: message, usage }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}
