import 'server-only';

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

export async function githubRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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
  return (await response.json()) as T;
}

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
    return await githubRequest<GitHubRepo>(`/repos/${fullName}`, token);
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
  return githubRequest<GitHubRepo>(params.org ? `/orgs/${encodeURIComponent(params.org)}/repos` : '/user/repos', params.token, {
    method: 'POST',
    // auto_init gives the repo a first commit, which the Git Data API needs to build on.
    body: JSON.stringify({ name: params.name, private: params.isPrivate, description: params.description, auto_init: true }),
  });
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
  const ref = await githubRequest<{ object: { sha: string } }>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const parent = await githubRequest<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${ref.object.sha}`, token);
  const tree = await githubRequest<{ sha: string }>(`/repos/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      tree: params.files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', content: file.content })),
    }),
  });
  if (tree.sha === parent.tree.sha) return null;
  const commit = await githubRequest<{ sha: string }>(`/repos/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: params.message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await githubRequest(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return { sha: commit.sha };
}
