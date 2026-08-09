import 'server-only';

import {
  applyCloudflareD1Migrations,
  configureCloudflarePagesProject,
  deployCloudflarePages,
  ensureCloudflarePagesProject,
  normalizeCloudflareProjectName,
  type CloudflareDeployFile,
} from '@/lib/cloudflare';
import { parseCloudflareManifest, parseCloudflareResourceState } from '@/lib/cloudflare-manifest';
import { buildCloudflarePagesConfig, provisionCloudflareResources } from '@/lib/cloudflare-resources';
import { deployCloudflareWorkers } from '@/lib/cloudflare-workers';
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
  allowResourceCreation?: boolean;
  onProgress?: (message: string) => void;
}) {
  const projectName = normalizeCloudflareProjectName(
    params.project.cloudflareProjectName || params.requestedProjectName || params.project.name
  );
  if (!projectName) throw new Error('Cloudflare project name is invalid');

  params.onProgress?.('Cloudflare: Preparing Pages project');
  await ensureCloudflarePagesProject({ token: params.token, accountId: params.accountId, projectName });

  const manifest = parseCloudflareManifest(params.files, projectName);
  let state = parseCloudflareResourceState(params.project.cloudflareResourcesJson);

  if (manifest) {
    state = await provisionCloudflareResources({
      token: params.token,
      accountId: params.accountId,
      manifest,
      state,
      allowCreate: params.allowResourceCreation === true,
      onProgress: params.onProgress,
      onStateChange: async (nextState) => updateCloudflareProjectConfig({
        projectName: params.project.name,
        cloudflareResourcesJson: JSON.stringify(nextState),
      }),
    });
  }

  const envVars = readCloudflareEnvVars(params.project.cloudflareEnvVarsEncrypted);
  if (manifest?.workers.length) {
    state = await deployCloudflareWorkers({
      token: params.token,
      accountId: params.accountId,
      manifest,
      state,
      files: params.files,
      secrets: envVars,
      allowCreate: params.allowResourceCreation === true,
      onProgress: params.onProgress,
      onStateChange: async (nextState) => updateCloudflareProjectConfig({
        projectName: params.project.name,
        cloudflareResourcesJson: JSON.stringify(nextState),
      }),
    });
  }

  const legacyD1 = state.d1?.DB;
  await updateCloudflareProjectConfig({
    projectName: params.project.name,
    cloudflareProjectName: projectName,
    cloudflareResourcesJson: JSON.stringify(state),
    cloudflareD1DatabaseId: legacyD1?.id,
    cloudflareD1DatabaseName: legacyD1?.name,
  });

  const bindings = manifest ? buildCloudflarePagesConfig(manifest, state) : undefined;
  if (bindings || Object.keys(envVars).length > 0) {
    await configureCloudflarePagesProject({
      token: params.token,
      accountId: params.accountId,
      projectName,
      bindings,
      envVars,
    });
  }

  if (manifest) {
    for (const database of manifest.bindings.d1) {
      const resource = state.d1?.[database.binding];
      if (!resource) throw new Error(`D1 binding ${database.binding} was not provisioned`);
      const prefix = `${database.migrations.replace(/\/+$/, '')}/`;
      const migrations = params.files.filter((file) => file.path.startsWith(prefix) && file.path.endsWith('.sql'));
      if (migrations.length > 0) {
        await applyCloudflareD1Migrations({
          token: params.token,
          accountId: params.accountId,
          databaseId: resource.id,
          migrations,
          migrationDir: database.migrations,
          onProgress: params.onProgress,
        });
      }
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
    d1DatabaseId: legacyD1?.id,
    d1DatabaseName: legacyD1?.name,
  };
}
