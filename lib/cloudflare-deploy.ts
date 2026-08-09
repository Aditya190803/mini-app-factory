import 'server-only';

import {
  applyCloudflareD1Migrations,
  configureCloudflarePagesProject,
  createCloudflareD1Database,
  deployCloudflarePages,
  ensureCloudflarePagesProject,
  normalizeCloudflareProjectName,
  type CloudflareDeployFile,
} from '@/lib/cloudflare';
import { decryptSecret } from '@/lib/secret-box';
import { updateCloudflareProjectConfig, type ProjectMetadata } from '@/lib/projects';

export function readCloudflareEnvVars(encrypted?: string): Record<string, string> {
  const plaintext = decryptSecret(encrypted);
  if (!plaintext) return {};
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

export async function deployProjectToCloudflare(params: {
  token: string;
  accountId: string;
  requestedProjectName?: string;
  project: ProjectMetadata;
  files: CloudflareDeployFile[];
  onProgress?: (message: string) => void;
}) {
  const projectName = normalizeCloudflareProjectName(
    params.project.cloudflareProjectName || params.requestedProjectName || params.project.name
  );
  if (!projectName) throw new Error('Cloudflare project name is invalid');

  params.onProgress?.('Cloudflare: Preparing Pages project');
  await ensureCloudflarePagesProject({
    token: params.token,
    accountId: params.accountId,
    projectName,
  });

  const migrations = params.files.filter(
    (file) => file.path.startsWith('migrations/') && file.path.endsWith('.sql')
  );
  let d1DatabaseId = params.project.cloudflareD1DatabaseId;
  let d1DatabaseName = params.project.cloudflareD1DatabaseName;

  if (migrations.length > 0 && !d1DatabaseId) {
    params.onProgress?.('Cloudflare: Creating D1 database');
    const database = await createCloudflareD1Database({
      token: params.token,
      accountId: params.accountId,
      name: `${projectName}-db`,
    });
    d1DatabaseId = database.uuid;
    d1DatabaseName = database.name;
  }

  await updateCloudflareProjectConfig({
    projectName: params.project.name,
    cloudflareProjectName: projectName,
    cloudflareD1DatabaseId: d1DatabaseId,
    cloudflareD1DatabaseName: d1DatabaseName,
  });

  if (d1DatabaseId) {
    await configureCloudflarePagesProject({
      token: params.token,
      accountId: params.accountId,
      projectName,
      d1DatabaseId,
      envVars: readCloudflareEnvVars(params.project.cloudflareEnvVarsEncrypted),
    });
    if (migrations.length > 0) {
      await applyCloudflareD1Migrations({
        token: params.token,
        accountId: params.accountId,
        databaseId: d1DatabaseId,
        migrations,
        onProgress: params.onProgress,
      });
    }
  } else {
    const envVars = readCloudflareEnvVars(params.project.cloudflareEnvVarsEncrypted);
    if (Object.keys(envVars).length > 0) {
      await configureCloudflarePagesProject({
        token: params.token,
        accountId: params.accountId,
        projectName,
        envVars,
      });
    }
  }

  const deployment = await deployCloudflarePages({
    token: params.token,
    accountId: params.accountId,
    projectName,
    files: params.files,
    onProgress: params.onProgress,
  });
  const deploymentUrl = `https://${projectName}.pages.dev`;

  await updateCloudflareProjectConfig({
    projectName: params.project.name,
    cloudflareProjectName: projectName,
    cloudflareDeploymentId: deployment.id,
    deploymentUrl,
  });

  return {
    deploymentId: deployment.id,
    deploymentUrl,
    previewUrl: deployment.url,
    cloudflareProjectName: projectName,
    d1DatabaseId,
    d1DatabaseName,
  };
}
