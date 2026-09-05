import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { addCloudflarePagesDomain, getCloudflarePagesDomain, listCloudflareZones, removeCloudflarePagesDomain } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { getProject, updateCloudflareProjectConfig } from '@/lib/projects';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  domain: z.string().trim().toLowerCase().max(253).regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Invalid domain'
  ),
}).strict();

const querySchema = z.object({ projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/) });

async function context(projectName: string) {
  const project = await getProject(projectName);
  if (!project) throw new Error('Project not found');
  if (!project.cloudflareProjectName) throw new Error('Deploy this project to Cloudflare first');
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) throw new Error('Cloudflare connection required');
  return { project, token: integration.cloudflareApiToken, accountId: integration.cloudflareAccountId, pagesProjectName: project.cloudflareProjectName };
}

export async function GET(req: Request) {
  if (!await stackServerApp.getUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'Invalid project' }, { status: 400 });
  try {
    const { project, token, accountId, pagesProjectName } = await context(parsed.data.projectName);
    const zones = await listCloudflareZones({ token, accountId });
    const domain = project.cloudflareCustomDomain
      ? await getCloudflarePagesDomain({ token, accountId, projectName: pagesProjectName, domain: project.cloudflareCustomDomain }).catch(() => null)
      : null;
    return Response.json({ zones: zones.filter((zone) => zone.status === 'active' && zone.type === 'full'), domain });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load domains' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid project or domain' }, { status: 400 });

  try {
    const { project, token, accountId, pagesProjectName } = await context(parsed.data.projectName);
    const zones = await listCloudflareZones({ token, accountId });
    const zone = zones.find((candidate) => candidate.status === 'active' && candidate.type === 'full' && (parsed.data.domain === candidate.name || parsed.data.domain.endsWith(`.${candidate.name}`)));
    if (!zone) return Response.json({ error: 'Choose a domain from an active zone in the connected Cloudflare account' }, { status: 400 });
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
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to add domain' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  if (!await stackServerApp.getUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid project' }, { status: 400 });
  try {
    const { project, token, accountId, pagesProjectName } = await context(parsed.data.projectName);
    if (project.cloudflareCustomDomain) {
      await removeCloudflarePagesDomain({ token, accountId, projectName: pagesProjectName, domain: project.cloudflareCustomDomain });
      await updateCloudflareProjectConfig({ projectName: parsed.data.projectName, cloudflareCustomDomain: null });
    }
    return Response.json({ removed: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to remove domain' }, { status: 400 });
  }
}
