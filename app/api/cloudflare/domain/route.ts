import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { addCloudflarePagesDomain } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { getProject, updateCloudflareProjectConfig } from '@/lib/projects';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  domain: z.string().trim().toLowerCase().max(253).regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Invalid domain'
  ),
}).strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid project or domain' }, { status: 400 });

  const project = await getProject(parsed.data.projectName);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (!project.cloudflareProjectName) {
    return Response.json({ error: 'Deploy this project to Cloudflare first' }, { status: 400 });
  }
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
    return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  }

  try {
    const domain = await addCloudflarePagesDomain({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      projectName: project.cloudflareProjectName,
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
