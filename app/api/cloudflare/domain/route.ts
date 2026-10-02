import { z } from 'zod';
import { upstreamErrorResponse, apiError } from '@/lib/api-route';
import { addCloudflarePagesDomain, getCloudflarePagesDomain, listCloudflareZones, removeCloudflarePagesDomain } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { updateCloudflareProjectConfig, type ProjectMetadata } from '@/lib/projects';
import { requireProjectRole } from '@/lib/project-access';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  domain: z.string().trim().toLowerCase().max(253).regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Invalid domain'
  ),
}).strict();

const querySchema = z.object({ projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/) });

async function context(project: ProjectMetadata) {
  if (!project.cloudflareProjectName) throw new Error('Deploy this project to Cloudflare first');
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) throw new Error('Cloudflare connection required');
  return { project, token: integration.cloudflareApiToken, accountId: integration.cloudflareAccountId, pagesProjectName: project.cloudflareProjectName };
}

export async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError(400, 'Invalid project', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  try {
    const { project, token, accountId, pagesProjectName } = await context(access.project);
    const zones = await listCloudflareZones({ token, accountId });
    const domain = project.cloudflareCustomDomain
      ? await getCloudflarePagesDomain({ token, accountId, projectName: pagesProjectName, domain: project.cloudflareCustomDomain }).catch(() => null)
      : null;
    return Response.json({ zones: zones.filter((zone) => zone.status === 'active' && zone.type === 'full'), domain });
  } catch (error) {
    return upstreamErrorResponse(error, 'Unable to load domains');
  }
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid project or domain', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;

  try {
    const { project, token, accountId, pagesProjectName } = await context(access.project);
    const zones = await listCloudflareZones({ token, accountId });
    const zone = zones.find((candidate) => candidate.status === 'active' && candidate.type === 'full' && (parsed.data.domain === candidate.name || parsed.data.domain.endsWith(`.${candidate.name}`)));
    if (!zone) return apiError(400, 'Choose a domain from an active zone in the connected Cloudflare account', 'INVALID_REQUEST');
    if (project.cloudflareCustomDomain && project.cloudflareCustomDomain !== parsed.data.domain) {
      await removeCloudflarePagesDomain({ token, accountId, projectName: pagesProjectName, domain: project.cloudflareCustomDomain });
    }
    const domain = await addCloudflarePagesDomain({
      token,
      accountId,
      projectName: pagesProjectName,
      domain: parsed.data.domain,
    });
    await updateCloudflareProjectConfig({
      projectName: parsed.data.projectName,
      cloudflareCustomDomain: parsed.data.domain,
    });
    return Response.json({ domain });
  } catch (error) {
    return upstreamErrorResponse(error, 'Unable to add domain');
  }
}

export async function DELETE(req: Request) {
  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid project', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  try {
    const { project, token, accountId, pagesProjectName } = await context(access.project);
    if (project.cloudflareCustomDomain) {
      await removeCloudflarePagesDomain({ token, accountId, projectName: pagesProjectName, domain: project.cloudflareCustomDomain });
      await updateCloudflareProjectConfig({ projectName: parsed.data.projectName, cloudflareCustomDomain: null });
    }
    return Response.json({ removed: true });
  } catch (error) {
    return upstreamErrorResponse(error, 'Unable to remove domain');
  }
}
