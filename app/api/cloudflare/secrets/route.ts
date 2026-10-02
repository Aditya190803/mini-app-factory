import { z } from 'zod';
import { apiError } from '@/lib/api-route';
import { configureCloudflarePagesProject } from '@/lib/cloudflare';
import { cloudflareEnvVarsContext, readCloudflareEnvVars } from '@/lib/cloudflare-deploy';
import { getIntegrationTokens } from '@/lib/integrations';
import { getFiles, getProjectCloudflareEnvVars, updateCloudflareProjectConfig } from '@/lib/projects';
import { requireProjectRole } from '@/lib/project-access';
import { encryptSecret } from '@/lib/secret-box';
import { parseCloudflareResourceState, resolveCloudflareManifest } from '@/lib/cloudflare-manifest';
import { buildCloudflarePagesConfig } from '@/lib/cloudflare-resources';
import { configureCloudflareWorkerSecrets } from '@/lib/cloudflare-workers';

const projectNameSchema = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/);
const secretSchema = z.object({
  projectName: projectNameSchema,
  name: z.string().trim().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().max(16_384).nullable(),
}).strict();

export async function GET(req: Request) {
  const projectName = new URL(req.url).searchParams.get('projectName') ?? '';
  if (!projectNameSchema.safeParse(projectName).success) {
    return apiError(400, 'Invalid project name', 'INVALID_REQUEST');
  }
  const access = await requireProjectRole(projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;

  return Response.json({
    names: Object.keys(readCloudflareEnvVars(await getProjectCloudflareEnvVars(projectName), projectName)).sort(),
    cloudflareProjectName: project.cloudflareProjectName,
    d1DatabaseName: project.cloudflareD1DatabaseName,
    customDomain: project.cloudflareCustomDomain,
  });
}

export async function POST(req: Request) {
  const parsed = secretSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid secret', 'INVALID_REQUEST');

  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;
  const envVars = readCloudflareEnvVars(await getProjectCloudflareEnvVars(project.name), project.name);
  if (parsed.data.value === null) delete envVars[parsed.data.name];
  else envVars[parsed.data.name] = parsed.data.value;

  await updateCloudflareProjectConfig({
    projectName: parsed.data.projectName,
    cloudflareEnvVarsEncrypted: encryptSecret(JSON.stringify(envVars), cloudflareEnvVarsContext(project.name)),
  });

  if (project.cloudflareProjectName) {
    const integration = await getIntegrationTokens();
    if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
      return Response.json({ error: 'Secret saved, but Cloudflare must be reconnected to sync it' }, { status: 409 });
    }
    const files = await getFiles(parsed.data.projectName);
    const state = parseCloudflareResourceState(project.cloudflareResourcesJson);
    const manifest = resolveCloudflareManifest(files, project.cloudflareProjectName, state);
    const secrets = {
      ...envVars,
      ...(parsed.data.value === null ? { [parsed.data.name]: null } : {}),
    };
    await configureCloudflarePagesProject({
      token: integration.cloudflareApiToken,
      accountId: integration.cloudflareAccountId,
      projectName: project.cloudflareProjectName,
      bindings: manifest
        ? buildCloudflarePagesConfig(manifest, state)
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
