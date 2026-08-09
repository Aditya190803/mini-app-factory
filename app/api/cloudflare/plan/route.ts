import { stackServerApp } from '@/stack/server';
import { getFiles, getProject } from '@/lib/projects';
import { getIntegrationTokens } from '@/lib/integrations';
import { normalizeCloudflareProjectName } from '@/lib/deploy-shared';
import { parseCloudflareManifest, parseCloudflareResourceState } from '@/lib/cloudflare-manifest';
import { planCloudflareResources } from '@/lib/cloudflare-resources';
import { z } from 'zod';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  cloudflareProjectName: z.string().trim().min(1).max(58).optional(),
}).strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const [project, files, integration] = await Promise.all([
      getProject(parsed.data.projectName),
      getFiles(parsed.data.projectName),
      getIntegrationTokens(),
    ]);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
      return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
    }

    const cloudflareProjectName = normalizeCloudflareProjectName(
      project.cloudflareProjectName || parsed.data.cloudflareProjectName || project.name
    );
    const manifest = parseCloudflareManifest(files, cloudflareProjectName);
    if (!manifest) return Response.json({ actions: [], needsConfirmation: false });

    const actions = await planCloudflareResources({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      manifest,
      state: parseCloudflareResourceState(project.cloudflareResourcesJson),
    });
    return Response.json({
      actions,
      needsConfirmation: actions.some((action) => action.action === 'create'),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to plan Cloudflare resources' },
      { status: 400 }
    );
  }
}
