import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { cloudflareRequest } from '@/lib/cloudflare';
import { deployProjectToCloudflare } from '@/lib/cloudflare-deploy';
import { normalizeCloudflareProjectName } from '@/lib/deploy-shared';
import { getIntegrationTokens } from '@/lib/integrations';
import { getFiles, getProject, getUserProjects, updateCloudflareProjectConfig } from '@/lib/projects';
import { parseCloudflareResourceState } from '@/lib/cloudflare-manifest';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  confirmResources: z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const [project, files, integration, projects] = await Promise.all([
    getProject(parsed.data.projectName),
    getFiles(parsed.data.projectName),
    getIntegrationTokens(),
    getUserProjects(),
  ]);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  const activePreviews = projects.filter((item) => (item.cloudflarePreviewExpiresAt ?? 0) > Date.now()).length;
  if (!project.cloudflarePreviewUrl && activePreviews >= 3) return Response.json({ error: 'Preview quota reached. Delete an existing preview first.' }, { status: 429 });
  const previewName = normalizeCloudflareProjectName(`${project.name}-preview`);
  try {
    const result = await deployProjectToCloudflare({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      requestedProjectName: previewName,
      project,
      files,
      allowResourceCreation: parsed.data.confirmResources === true,
      target: 'preview',
    });
    return Response.json({ ...result, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview deployment failed';
    return Response.json({ error: message, needsConfirmation: message.includes('requires confirmation') }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const [project, integration] = await Promise.all([getProject(parsed.data.projectName), getIntegrationTokens()]);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  const token = integration.cloudflareApiToken;
  const accountId = encodeURIComponent(integration.cloudflareAccountId);
  const state = parseCloudflareResourceState(project.cloudflarePreviewResourcesJson);
  const failures: string[] = [];
  const remove = async (label: string, path: string) => {
    try { await cloudflareRequest(path, token, { method: 'DELETE' }); }
    catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : 'delete failed'}`); }
  };
  if (project.cloudflarePreviewProjectName) await remove('Pages project', `/accounts/${accountId}/pages/projects/${encodeURIComponent(project.cloudflarePreviewProjectName)}`);
  for (const resource of Object.values(state.d1 || {})) await remove(`D1 ${resource.name}`, `/accounts/${accountId}/d1/database/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.kv || {})) await remove(`KV ${resource.name}`, `/accounts/${accountId}/storage/kv/namespaces/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.queue || {})) await remove(`Queue ${resource.name}`, `/accounts/${accountId}/queues/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.r2 || {})) await remove(`R2 ${resource.name}`, `/accounts/${accountId}/r2/buckets/${encodeURIComponent(resource.name)}`);
  for (const resource of Object.values(state.worker || {})) await remove(`Worker ${resource.name}`, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(resource.name)}`);
  if (failures.length) return Response.json({ error: 'Some preview resources could not be deleted', failures }, { status: 409 });
  await updateCloudflareProjectConfig({
    projectName: project.name,
    cloudflarePreviewProjectName: null,
    cloudflarePreviewDeploymentId: null,
    cloudflarePreviewUrl: null,
    cloudflarePreviewResourcesJson: null,
    cloudflarePreviewExpiresAt: null,
  });
  return Response.json({ ok: true });
}
