import { z } from 'zod';
import { deployProjectToCloudflare } from '@/lib/cloudflare-deploy';
import { hasPreview, MAX_PREVIEWS_PER_USER, PREVIEW_TTL_MS, reapExpiredPreviews, teardownCloudflarePreview } from '@/lib/cloudflare-preview';
import { normalizeCloudflareProjectName } from '@/lib/deploy-shared';
import { getIntegrationTokens } from '@/lib/integrations';
import { getFiles, getUserProjects } from '@/lib/projects';
import { requireProjectRole } from '@/lib/project-access';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  confirmResources: z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;
  const [files, integration] = await Promise.all([getFiles(parsed.data.projectName), getIntegrationTokens()]);
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  const token = integration.cloudflareApiToken;
  const accountId = integration.cloudflareAccountId;

  const projects = await getUserProjects();
  const reaped = new Set(await reapExpiredPreviews({ token, accountId, projects }));
  // Count every preview that still holds resources. Counting only unexpired ones let expired
  // (but never deleted) previews pile up without limit.
  const livePreviews = projects.filter((item) => item.accessRole === 'owner' && hasPreview(item) && !reaped.has(item.name));
  if (!hasPreview(project) && livePreviews.length >= MAX_PREVIEWS_PER_USER) {
    return Response.json({ error: 'Preview quota reached. Delete an existing preview first.' }, { status: 429 });
  }
  const previewName = normalizeCloudflareProjectName(`${project.name}-preview`);
  try {
    const result = await deployProjectToCloudflare({
      token,
      accountId,
      requestedProjectName: previewName,
      project,
      files,
      allowResourceCreation: parsed.data.confirmResources === true,
      target: 'preview',
    });
    return Response.json({ ...result, expiresAt: Date.now() + PREVIEW_TTL_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview deployment failed';
    return Response.json({ error: message, needsConfirmation: message.includes('requires confirmation') }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  const failures = await teardownCloudflarePreview({
    token: integration.cloudflareApiToken,
    accountId: integration.cloudflareAccountId,
    project: access.project,
  });
  if (failures.length) return Response.json({ error: 'Some preview resources could not be deleted', failures }, { status: 409 });
  return Response.json({ ok: true });
}
