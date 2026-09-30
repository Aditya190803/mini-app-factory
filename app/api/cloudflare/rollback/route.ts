import { z } from 'zod';
import { ensureCloudflarePagesProject, rollbackCloudflarePagesDeployment } from '@/lib/cloudflare';
import { cloudflarePagesUrl } from '@/lib/cloudflare-deploy';
import { parseCloudflareResourceState } from '@/lib/cloudflare-manifest';
import { getIntegrationTokens } from '@/lib/integrations';
import { updateCloudflareProjectConfig } from '@/lib/projects';
import { requireProjectRole } from '@/lib/project-access';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/),
  deploymentId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9-]+$/),
}).strict();

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid rollback target' }, { status: 400 });

  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;
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
    const pagesProject = await ensureCloudflarePagesProject({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      projectName: project.cloudflareProjectName,
    });
    await updateCloudflareProjectConfig({
      projectName: parsed.data.projectName,
      cloudflareDeploymentId: parsed.data.deploymentId,
      deploymentUrl: cloudflarePagesUrl(project.cloudflareProjectName, pagesProject.subdomain),
    });
    // A Pages rollback restores static assets and Pages Functions only. Standalone Workers, their
    // cron schedules, and applied D1 migrations stay at the latest version; the response says so
    // rather than implying the whole app went back.
    const state = parseCloudflareResourceState(project.cloudflareResourcesJson);
    const notRolledBack = [
      ...Object.keys(state.worker ?? {}).map((name) => `Worker ${name}`),
      ...(Object.keys(state.migrationHashes ?? {}).length ? ['D1 database migrations'] : []),
    ];
    return Response.json({ deployment, notRolledBack });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Rollback failed' },
      { status: 400 }
    );
  }
}
