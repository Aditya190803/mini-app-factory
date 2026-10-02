import { getFiles } from '@/lib/projects';
import { upstreamErrorResponse, apiError } from '@/lib/api-route';
import { requireProjectRole } from '@/lib/project-access';
import { getIntegrationTokens } from '@/lib/integrations';
import { normalizeCloudflareProjectName } from '@/lib/deploy-shared';
import { parseCloudflareResourceState, resolveCloudflareManifest } from '@/lib/cloudflare-manifest';
import { planCloudflareResources } from '@/lib/cloudflare-resources';
import { z } from 'zod';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  cloudflareProjectName: z.string().trim().min(1).max(58).optional(),
}).strict();

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid request', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;

  try {
    const [files, integration] = await Promise.all([
      getFiles(parsed.data.projectName),
      getIntegrationTokens(),
    ]);
    if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
      return apiError(400, 'Cloudflare connection required', 'CLOUDFLARE_NOT_CONNECTED');
    }

    const cloudflareProjectName = normalizeCloudflareProjectName(
      project.cloudflareProjectName || parsed.data.cloudflareProjectName || project.name
    );
    const state = parseCloudflareResourceState(project.cloudflareResourcesJson);
    const manifest = resolveCloudflareManifest(files, cloudflareProjectName, state);
    if (!manifest) return Response.json({ actions: [], needsConfirmation: false });

    const actions = await planCloudflareResources({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      manifest,
      state,
    });
    return Response.json({
      actions,
      needsConfirmation: actions.some((action) => action.action === 'create'),
    });
  } catch (error) {
    return upstreamErrorResponse(error, 'Unable to plan Cloudflare resources');
  }
}
