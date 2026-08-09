import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { configureCloudflarePagesProject } from '@/lib/cloudflare';
import { readCloudflareEnvVars } from '@/lib/cloudflare-deploy';
import { getIntegrationTokens } from '@/lib/integrations';
import { getFiles, getProject, updateCloudflareProjectConfig } from '@/lib/projects';
import { encryptSecret } from '@/lib/secret-box';
import { parseCloudflareManifest, parseCloudflareResourceState } from '@/lib/cloudflare-manifest';
import { buildCloudflarePagesConfig } from '@/lib/cloudflare-resources';
import { configureCloudflareWorkerSecrets } from '@/lib/cloudflare-workers';

const projectNameSchema = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/);
const secretSchema = z.object({
  projectName: projectNameSchema,
  name: z.string().trim().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().max(16_384).nullable(),
}).strict();

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const projectName = new URL(req.url).searchParams.get('projectName') ?? '';
  if (!projectNameSchema.safeParse(projectName).success) {
    return Response.json({ error: 'Invalid project name' }, { status: 400 });
  }
  const project = await getProject(projectName);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  return Response.json({
    names: Object.keys(readCloudflareEnvVars(project.cloudflareEnvVarsEncrypted)).sort(),
    cloudflareProjectName: project.cloudflareProjectName,
    d1DatabaseName: project.cloudflareD1DatabaseName,
    customDomain: project.cloudflareCustomDomain,
  });
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = secretSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid secret' }, { status: 400 });

  const project = await getProject(parsed.data.projectName);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
  const envVars = readCloudflareEnvVars(project.cloudflareEnvVarsEncrypted);
  if (parsed.data.value === null) delete envVars[parsed.data.name];
  else envVars[parsed.data.name] = parsed.data.value;

  await updateCloudflareProjectConfig({
    projectName: parsed.data.projectName,
    cloudflareEnvVarsEncrypted: encryptSecret(JSON.stringify(envVars)),
  });

  if (project.cloudflareProjectName) {
    const integration = await getIntegrationTokens();
    if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
      return Response.json({ error: 'Secret saved, but Cloudflare must be reconnected to sync it' }, { status: 409 });
    }
    const files = await getFiles(parsed.data.projectName);
    const manifest = parseCloudflareManifest(files, project.cloudflareProjectName);
    const secrets = {
      ...envVars,
      ...(parsed.data.value === null ? { [parsed.data.name]: null } : {}),
    };
    await configureCloudflarePagesProject({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      projectName: project.cloudflareProjectName,
      bindings: manifest
        ? buildCloudflarePagesConfig(manifest, parseCloudflareResourceState(project.cloudflareResourcesJson))
        : undefined,
      envVars: secrets,
    });
    if (manifest?.workers.length) {
      await configureCloudflareWorkerSecrets({
        token: integration.cloudflareApiToken,
        accountId: integration.cloudflareAccountId,
        workerNames: manifest.workers.map((worker) => worker.name),
        secrets,
      });
    }
  }

  return Response.json({ saved: true, names: Object.keys(envVars).sort() });
}
