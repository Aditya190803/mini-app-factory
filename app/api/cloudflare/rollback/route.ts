import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { rollbackCloudflarePagesDeployment } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { getProject, updateCloudflareProjectConfig } from '@/lib/projects';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  deploymentId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9-]+$/),
}).strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid rollback target' }, { status: 400 });

  const project = await getProject(parsed.data.projectName);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  if (!project.cloudflareProjectName) {
    return Response.json({ error: 'Project has no Cloudflare deployment' }, { status: 400 });
  }
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
    return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });
  }

  try {
    const deployment = await rollbackCloudflarePagesDeployment({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      projectName: project.cloudflareProjectName,
      deploymentId: parsed.data.deploymentId,
    });
    await updateCloudflareProjectConfig({
      projectName: parsed.data.projectName,
      cloudflareDeploymentId: parsed.data.deploymentId,
      deploymentUrl: `https://${project.cloudflareProjectName}.pages.dev`,
    });
    return Response.json({ deployment });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Rollback failed' },
      { status: 400 }
    );
  }
}
