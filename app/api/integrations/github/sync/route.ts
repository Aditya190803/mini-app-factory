import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { getIntegrationTokens } from '@/lib/integrations';
import { createProjectVersion, getFiles, getProject, saveFiles } from '@/lib/projects';
import { assertCanAccessProject } from '@/lib/project-access';
import { extractRepoFullNameFromUrl } from '@/lib/deploy-shared';
import { classifyGitHubFile, diffProjectFiles } from '@/lib/github-sync';
import type { ProjectFile } from '@/lib/page-builder';

const schema = z.object({ projectName: z.string().min(1).max(120) }).strict();
const headers = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });

async function github<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: headers(token), cache: 'no-store' });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
  return await response.json() as T;
}

async function context(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => null);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: Response.json({ error: 'Invalid request' }, { status: 400 }) } as const;
  const project = await getProject(parsed.data.projectName);
  const access = assertCanAccessProject(project, user.id);
  if (!access.ok) return { error: Response.json({ error: access.message }, { status: access.status }) } as const;
  const repo = extractRepoFullNameFromUrl(project?.repoUrl);
  if (!repo) return { error: Response.json({ error: 'This project is not linked to a GitHub repository' }, { status: 400 }) } as const;
  const integration = await getIntegrationTokens();
  if (!integration?.githubAccessToken) return { error: Response.json({ error: 'GitHub connection required' }, { status: 400 }) } as const;
  return { projectName: parsed.data.projectName, repo, token: integration.githubAccessToken } as const;
}

async function remoteFiles(repo: string, token: string): Promise<{ branch: string; files: ProjectFile[] }> {
  const metadata = await github<{ default_branch?: string }>(`https://api.github.com/repos/${repo}`, token);
  const branch = metadata.default_branch || 'main';
  const tree = await github<{ truncated?: boolean; tree?: Array<{ path: string; type: string; size?: number; url?: string }> }>(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  if (tree.truncated) throw new Error('Repository tree is too large to sync safely');
  const candidates = (tree.tree || []).filter((entry) => entry.type === 'blob' && entry.url && classifyGitHubFile(entry.path));
  if (candidates.length === 0) throw new Error('Repository has no supported app files to sync');
  if (candidates.length > 200) throw new Error('GitHub sync is limited to 200 supported files');
  if (candidates.some((entry) => (entry.size || 0) > 500_000) || candidates.reduce((sum, entry) => sum + (entry.size || 0), 0) > 2_000_000) throw new Error('GitHub sync is limited to 2 MB and 500 KB per file');
  const files: ProjectFile[] = [];
  for (let index = 0; index < candidates.length; index += 10) {
    const batch = candidates.slice(index, index + 10);
    files.push(...await Promise.all(batch.map(async (entry) => {
      const blob = await github<{ content?: string; encoding?: string }>(entry.url!, token);
      if (blob.encoding !== 'base64' || !blob.content) throw new Error(`Unable to decode ${entry.path}`);
      const classification = classifyGitHubFile(entry.path)!;
      const content = Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8');
      if (content.includes('\0') || content.includes('\uFFFD')) throw new Error(`${entry.path} is not valid UTF-8 text`);
      return { path: entry.path, content, ...classification };
    })));
  }
  return { branch, files };
}

export async function GET(req: Request) {
  try {
    const ctx = await context(req); if ('error' in ctx) return ctx.error;
    const [local, remote] = await Promise.all([getFiles(ctx.projectName), remoteFiles(ctx.repo, ctx.token)]);
    return Response.json({ repository: ctx.repo, branch: remote.branch, fileCount: remote.files.length, diff: diffProjectFiles(local, remote.files) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'GitHub sync failed' }, { status: 400 }); }
}

export async function POST(req: Request) {
  try {
    const ctx = await context(req); if ('error' in ctx) return ctx.error;
    const [local, remote] = await Promise.all([getFiles(ctx.projectName), remoteFiles(ctx.repo, ctx.token)]);
    const diff = diffProjectFiles(local, remote.files);
    await createProjectVersion(ctx.projectName, `Before pulling ${ctx.repo}@${remote.branch}`, local);
    await saveFiles(ctx.projectName, remote.files);
    return Response.json({ repository: ctx.repo, branch: remote.branch, fileCount: remote.files.length, diff });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'GitHub sync failed' }, { status: 400 }); }
}
