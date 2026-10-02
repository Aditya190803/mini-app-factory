import 'server-only';

import {
  applyCloudflareD1Migrations,
  configureCloudflarePagesProject,
  deployCloudflarePages,
  ensureCloudflarePagesProject,
  normalizeCloudflareProjectName,
  type CloudflareDeployFile,
} from '@/lib/cloudflare';
import { disallowedMigrationStatements, parseCloudflareResourceState, resolveCloudflareManifest } from '@/lib/cloudflare-manifest';
import { buildCloudflarePagesConfig, provisionCloudflareResources } from '@/lib/cloudflare-resources';
import { deployCloudflareWorkers } from '@/lib/cloudflare-workers';
import { decryptSecret } from '@/lib/secret-box';
import { getProjectCloudflareEnvVars, updateCloudflareProjectConfig, type ProjectMetadata } from '@/lib/projects';
import { blake3 } from '@noble/hashes/blake3';

function migrationHash(content: string) {
  return Buffer.from(blake3(new TextEncoder().encode(content))).toString('hex');
}

function assertSafeMigrations(files: CloudflareDeployFile[], applied: Record<string, string>) {
  for (const file of files.filter((candidate) => candidate.path.endsWith('.sql'))) {
    // Already-applied migrations are checked by hash below; only new ones need the allowlist.
    if (!applied[file.path]) {
      const rejected = disallowedMigrationStatements(file.content);
      if (rejected.length) {
        throw new Error(`Migration ${file.path} needs manual review: only CREATE, ALTER TABLE ... ADD/RENAME, and INSERT run automatically. Rejected: ${rejected[0]!.slice(0, 120)}`);
      }
    }
    const previousHash = applied[file.path];
    if (previousHash && previousHash !== migrationHash(file.content)) {
      throw new Error(`Applied migration was modified: ${file.path}. Add a new migration instead.`);
    }
  }
}

/** The production URL of a Pages project, from the subdomain Cloudflare reports when known. */
export function cloudflarePagesUrl(projectName: string, subdomain?: string) {
  return `https://${subdomain || `${projectName}.pages.dev`}`;
}

/** AAD context for a project's env var blob. Binds the ciphertext to the project it belongs to. */
export function cloudflareEnvVarsContext(projectName: string) {
  return `cloudflare-env:${projectName}`;
}

export function readCloudflareEnvVars(encrypted: string | null | undefined, projectName: string): Record<string, string> {
  const plaintext = decryptSecret(encrypted, cloudflareEnvVarsContext(projectName));
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
  target?: 'production' | 'preview';
  onProgress?: (message: string) => void;
}) {
  const target = params.target ?? 'production';
  const projectName = normalizeCloudflareProjectName(
    params.requestedProjectName || (target === 'preview' ? params.project.cloudflarePreviewProjectName : params.project.cloudflareProjectName) || params.project.name
  );
  if (!projectName) throw new Error('Cloudflare project name is invalid');

  params.onProgress?.('Cloudflare: Preparing Pages project');
  const pagesProject = await ensureCloudflarePagesProject({ token: params.token, accountId: params.accountId, projectName });

  let state = parseCloudflareResourceState(target === 'preview' ? params.project.cloudflarePreviewResourcesJson : params.project.cloudflareResourcesJson);
  const parsedManifest = resolveCloudflareManifest(params.files, projectName, state);
  const manifest = parsedManifest && target === 'preview' ? {
    ...parsedManifest,
    bindings: {
      ...parsedManifest.bindings,
      d1: parsedManifest.bindings.d1.map((item) => ({ ...item, name: `${item.name}-preview`.slice(0, 63).replace(/-+$/, '') })),
      kv: parsedManifest.bindings.kv.map((item) => ({ ...item, name: `${item.name}-preview`.slice(0, 63).replace(/-+$/, '') })),
      r2: parsedManifest.bindings.r2.map((item) => ({ ...item, name: `${item.name}-preview`.slice(0, 63).replace(/-+$/, '') })),
      queues: parsedManifest.bindings.queues.map((item) => ({ ...item, name: `${item.name}-preview`.slice(0, 63).replace(/-+$/, '') })),
    },
    workers: parsedManifest.workers.map((worker) => ({ ...worker, name: `${worker.name}-preview`.slice(0, 63).replace(/-+$/, '') })),
  } : parsedManifest;
  assertSafeMigrations(params.files, state.migrationHashes ?? {});

  const persistState = async (nextState: typeof state) => updateCloudflareProjectConfig(target === 'preview' ? {
    projectName: params.project.name,
    cloudflarePreviewResourcesJson: JSON.stringify(nextState),
  } : {
    projectName: params.project.name,
    cloudflareResourcesJson: JSON.stringify(nextState),
  });

  if (manifest) {
    state = await provisionCloudflareResources({
      token: params.token,
      accountId: params.accountId,
      manifest,
      state,
      allowCreate: params.allowResourceCreation === true,
      onProgress: params.onProgress,
      onStateChange: persistState,
    });
  }

  const envVars = target === 'preview'
    ? {}
    : readCloudflareEnvVars(await getProjectCloudflareEnvVars(params.project.name), params.project.name);
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
      onStateChange: persistState,
    });
  }

  const legacyD1 = state.d1?.DB;
  await updateCloudflareProjectConfig(target === 'preview' ? {
    projectName: params.project.name,
    cloudflarePreviewProjectName: projectName,
    cloudflarePreviewResourcesJson: JSON.stringify(state),
  } : {
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
        state.migrationHashes = {
          ...state.migrationHashes,
          ...Object.fromEntries(migrations.map((migration) => [migration.path, migrationHash(migration.content)])),
        };
        await persistState(state);
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
  // Cloudflare assigns the *.pages.dev subdomain, and it is not always the project name (a taken
  // name gets a random suffix), so use the one it reports.
  const deploymentUrl = cloudflarePagesUrl(projectName, pagesProject.subdomain);

  await updateCloudflareProjectConfig(target === 'preview' ? {
    projectName: params.project.name,
    cloudflarePreviewProjectName: projectName,
    cloudflarePreviewDeploymentId: deployment.id,
    cloudflarePreviewUrl: deploymentUrl,
    cloudflarePreviewExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
  } : {
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
