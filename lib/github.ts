import 'server-only';
import { z } from 'zod';

/**
 * GitHub REST client for deploys and sync. Modelled on cloudflareRequest: one request function
 * that raises a typed error carrying the status, so callers branch on `error.status === 404`
 * instead of regex-matching message strings.
 */

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

const API = 'https://api.github.com';

/** Pass `schema` when the response decides what gets written; it is validated, not cast. */
export async function githubRequest<T>(path: string, token: string, init?: RequestInit, schema?: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    // Only GitHub's own message is surfaced; the raw body can echo request details.
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubApiError(response.status, `GitHub API error: ${response.status} ${body?.message ?? response.statusText}`);
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json();
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new GitHubApiError(502, `GitHub returned an unexpected response for ${path.split('?')[0]}`);
  return parsed.data;
}

const repoSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  full_name: z.string().min(1),
  default_branch: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }).passthrough(),
}).passthrough();
const shaSchema = z.object({ sha: z.string().min(1) }).passthrough();
const refSchema = z.object({ object: shaSchema }).passthrough();
const commitSchema = z.object({ tree: shaSchema }).passthrough();

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  owner: { login: string };
};

/** The repo, or null when it does not exist (or the token cannot see it). */
export async function findGitHubRepo(fullName: string, token: string): Promise<GitHubRepo | null> {
  try {
    return await githubRequest(`/repos/${fullName}`, token, undefined, repoSchema);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createGitHubRepo(params: {
  token: string;
  org: string | null;
  name: string;
  isPrivate: boolean;
  description?: string;
}): Promise<GitHubRepo> {
  return githubRequest(params.org ? `/orgs/${encodeURIComponent(params.org)}/repos` : '/user/repos', params.token, {
    method: 'POST',
    // auto_init gives the repo a first commit, which the Git Data API needs to build on.
    body: JSON.stringify({ name: params.name, private: params.isPrivate, description: params.description, auto_init: true }),
  }, repoSchema);
}

/**
 * Make the branch contain exactly `files`, in one commit.
 *
 * The previous deploy made one commit per file through the contents API and never removed
 * anything, so a file deleted in the editor lived on in the repo forever. Building a tree without
 * `base_tree` replaces the whole tree, which deletes whatever is not listed. Returns null when the
 * tree is unchanged and no commit was needed.
 */
export async function commitGitHubTree(params: {
  token: string;
  repo: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  message: string;
}): Promise<{ sha: string } | null> {
  const { token, repo, branch } = params;
  const ref = await githubRequest(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token, undefined, refSchema);
  const parent = await githubRequest(`/repos/${repo}/git/commits/${ref.object.sha}`, token, undefined, commitSchema);
  const tree = await githubRequest(`/repos/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      tree: params.files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
    }),
  }, shaSchema);
  if (tree.sha === parent.tree.sha) return null;
  const commit = await githubRequest(`/repos/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: params.message, tree: tree.sha, parents: [ref.object.sha] }),
  }, shaSchema);
  await githubRequest(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return { sha: commit.sha };
}
