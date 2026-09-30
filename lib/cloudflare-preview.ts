import 'server-only';

import { cloudflareRequest } from '@/lib/cloudflare';
import { parseCloudflareResourceState } from '@/lib/cloudflare-manifest';
import { updateCloudflareProjectConfig, type ProjectMetadata } from '@/lib/projects';

export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PREVIEWS_PER_USER = 3;

/** Whether a project currently holds preview resources, expired or not. */
export function hasPreview(project: Pick<ProjectMetadata, 'cloudflarePreviewProjectName' | 'cloudflarePreviewResourcesJson'>) {
  return Boolean(project.cloudflarePreviewProjectName || project.cloudflarePreviewResourcesJson);
}

/**
 * Delete every Cloudflare resource a preview created, then clear the preview fields. Returns the
 * resources that could not be deleted; the fields are only cleared when everything went.
 */
export async function teardownCloudflarePreview(params: {
  token: string;
  accountId: string;
  project: ProjectMetadata;
}): Promise<string[]> {
  const accountId = encodeURIComponent(params.accountId);
  const state = parseCloudflareResourceState(params.project.cloudflarePreviewResourcesJson);
  const failures: string[] = [];
  const remove = async (label: string, path: string) => {
    try { await cloudflareRequest(path, params.token, { method: 'DELETE' }); }
    catch (error) { failures.push(`${label}: ${error instanceof Error ? error.message : 'delete failed'}`); }
  };
  if (params.project.cloudflarePreviewProjectName) await remove('Pages project', `/accounts/${accountId}/pages/projects/${encodeURIComponent(params.project.cloudflarePreviewProjectName)}`);
  for (const resource of Object.values(state.worker || {})) await remove(`Worker ${resource.name}`, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(resource.name)}`);
  for (const resource of Object.values(state.d1 || {})) await remove(`D1 ${resource.name}`, `/accounts/${accountId}/d1/database/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.kv || {})) await remove(`KV ${resource.name}`, `/accounts/${accountId}/storage/kv/namespaces/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.queue || {})) await remove(`Queue ${resource.name}`, `/accounts/${accountId}/queues/${encodeURIComponent(resource.id)}`);
  for (const resource of Object.values(state.r2 || {})) await remove(`R2 ${resource.name}`, `/accounts/${accountId}/r2/buckets/${encodeURIComponent(resource.name)}`);
  if (failures.length) return failures;
  await updateCloudflareProjectConfig({
    projectName: params.project.name,
    cloudflarePreviewProjectName: null,
    cloudflarePreviewDeploymentId: null,
    cloudflarePreviewUrl: null,
    cloudflarePreviewResourcesJson: null,
    cloudflarePreviewExpiresAt: null,
  });
  return [];
}

/**
 * Tear down the caller's expired previews. Previews promised a 24-hour lifetime but nothing
 * removed them, so they lived (and billed) forever. Run opportunistically before a new preview is
 * created; failures are left for the next attempt.
 */
export async function reapExpiredPreviews(params: { token: string; accountId: string; projects: ProjectMetadata[] }) {
  const now = Date.now();
  const expired = params.projects.filter(
    (project) => project.accessRole === 'owner' && hasPreview(project) && (project.cloudflarePreviewExpiresAt ?? 0) <= now
  );
  for (const project of expired) {
    await teardownCloudflarePreview({ token: params.token, accountId: params.accountId, project }).catch(() => undefined);
  }
  return expired.map((project) => project.name);
}
