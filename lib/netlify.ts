import 'server-only';

import { githubRequest } from '@/lib/github';

export class NetlifyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'NetlifyApiError';
  }
}

export async function netlifyRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; errors?: unknown } | null;
    const detail = body?.message ?? (body?.errors ? JSON.stringify(body.errors) : response.statusText);
    throw new NetlifyApiError(response.status, `Netlify API error: ${response.status} ${detail}`);
  }
  return (await response.json()) as T;
}

type NetlifySite = { id: string; name: string; url?: string; ssl_url?: string; build_settings?: { repo_url?: string } };

async function findSite(token: string, name: string): Promise<NetlifySite | null> {
  try {
    return await netlifyRequest<NetlifySite>(`/sites/${encodeURIComponent(`${name}.netlify.app`)}`, token);
  } catch (error) {
    if (error instanceof NetlifyApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Connect a GitHub repo to a Netlify site, reusing the one from the last deploy.
 *
 * Every redeploy used to create a new site and a new deploy key. When the project already records
 * a site linked to this repo, the push that just happened triggers its build through the existing
 * webhook, so there is nothing more to do.
 */
export async function ensureNetlifySiteForRepo(params: {
  netlifyToken: string;
  githubToken: string;
  existingSiteName?: string;
  preferredSiteName: string;
  repo: { id: number; name: string; owner: string; branch: string; isPrivate: boolean };
  onProgress?: (message: string) => void;
}): Promise<{ name: string; url?: string; reused: boolean }> {
  const repoFullName = `${params.repo.owner}/${params.repo.name}`;
  if (params.existingSiteName) {
    const existing = await findSite(params.netlifyToken, params.existingSiteName);
    if (existing && existing.build_settings?.repo_url?.endsWith(`/${repoFullName}`)) {
      params.onProgress?.('Netlify: Reusing existing site');
      await netlifyRequest(`/sites/${existing.id}/builds`, params.netlifyToken, { method: 'POST' }).catch(() => undefined);
      return { name: existing.name, url: existing.ssl_url || existing.url, reused: true };
    }
  }

  params.onProgress?.('Netlify: Configuring deploy key');
  const deployKey = await netlifyRequest<{ id: string; public_key: string }>('/deploy_keys', params.netlifyToken, { method: 'POST' });
  await githubRequest(`/repos/${repoFullName}/keys`, params.githubToken, {
    method: 'POST',
    body: JSON.stringify({ title: 'Netlify Deploy Key', key: deployKey.public_key, read_only: true }),
  }).catch(() => undefined); // already present

  params.onProgress?.('Netlify: Setting up GitHub webhook');
  const hooks = await githubRequest<Array<{ config?: { url?: string } }>>(`/repos/${repoFullName}/hooks`, params.githubToken).catch(() => []);
  if (!hooks.some((hook) => hook.config?.url === 'https://api.netlify.com/hooks/github')) {
    await githubRequest(`/repos/${repoFullName}/hooks`, params.githubToken, {
      method: 'POST',
      body: JSON.stringify({ name: 'web', active: true, events: ['push'], config: { url: 'https://api.netlify.com/hooks/github', content_type: 'json' } }),
    }).catch(() => undefined);
  }

  params.onProgress?.('Netlify: Creating site');
  const create = (name: string) => netlifyRequest<NetlifySite>('/sites', params.netlifyToken, {
    method: 'POST',
    body: JSON.stringify({
      name,
      repo: {
        provider: 'github',
        repo: repoFullName,
        private: params.repo.isPrivate,
        branch: params.repo.branch,
        deploy_key_id: deployKey.id,
        repo_id: params.repo.id,
      },
    }),
  });
  let site: NetlifySite;
  try {
    site = await create(params.preferredSiteName);
  } catch (error) {
    if (!(error instanceof NetlifyApiError && error.status === 422)) throw error;
    site = await create(`${params.preferredSiteName}-${Math.random().toString(36).slice(2, 6)}`);
  }
  return { name: site.name || params.preferredSiteName, url: site.ssl_url || site.url, reused: false };
}
