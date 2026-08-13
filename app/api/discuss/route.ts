import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { assertCanAccessProject } from '@/lib/project-access';
import { getFiles, getProject } from '@/lib/projects';
import { getAIClient } from '@/lib/ai-client';
import { getGlobalAdminModelConfig, getPersistedAISettings } from '@/lib/ai-settings-store';
import { appendProjectMessage, appendProjectRunEvent, createProjectRun, finishProjectRun } from '@/lib/project-runs';
import { isAIProviderId } from '@/lib/ai-admin-config';

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
  const access = assertCanAccessProject(project, user.id);
  if (!access.ok) return Response.json({ error: access.message }, { status: access.status });

  const { runId, projectId } = await createProjectRun(parsed.data.projectName, 'discuss', parsed.data.prompt);
  await appendProjectMessage(parsed.data.projectName, 'user', parsed.data.prompt);
  await appendProjectRunEvent({ projectId, runId, type: 'planning', message: 'Reviewing the project without changing files' });

  try {
    const [files, adminConfig, persisted] = await Promise.all([
      getFiles(parsed.data.projectName),
      getGlobalAdminModelConfig(),
      getPersistedAISettings(),
    ]);
    const manifest = files.map((file) => `${file.path} (${file.fileType})`).join('\n');
    const focused = files
      .filter((file) => ['wrangler.jsonc', '_worker.js', 'index.html', 'styles.css', 'script.js'].includes(file.path))
      .map((file) => `\n--- ${file.path} ---\n${file.content}`)
      .join('')
      .slice(0, 80_000);
    const client = await getAIClient({ adminConfig, byokConfig: persisted.byokConfig });
    const session = await client.createSession({
      model: parsed.data.modelId || process.env.OPENCODE_MODEL || 'deepseek-v4-flash-free',
      providerId: isAIProviderId(parsed.data.providerId) ? parsed.data.providerId : undefined,
      systemMessage: { content: 'You are discussing an existing generated application. Answer clearly using the supplied project context. Do not claim to edit files, run commands, or deploy anything. Mention exact files when useful.' },
    });
    let content = '';
    try {
      const response = await session.sendAndWait({ prompt: `Project files:\n${manifest}${focused}\n\nUser question:\n${parsed.data.prompt}`, maxOutputTokens: 2000 }, 90_000);
      content = response?.data?.content?.trim() || 'I could not produce an answer.';
    } finally {
      await session.destroy().catch(() => {});
    }
    await appendProjectMessage(parsed.data.projectName, 'assistant', content);
    await appendProjectRunEvent({ projectId, runId, type: 'completed', message: 'Discussion completed' });
    await finishProjectRun({ projectId, runId, status: 'completed' });
    return Response.json({ content, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discussion failed';
    await appendProjectMessage(parsed.data.projectName, 'system', `Discussion failed: ${message}`, 'failed').catch(() => {});
    await finishProjectRun({ projectId, runId, status: 'failed', errorCode: 'DISCUSS_ERROR', errorMessage: message }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}
