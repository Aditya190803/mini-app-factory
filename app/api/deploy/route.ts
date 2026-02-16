import { stackServerApp } from "@/stack/server";
import { getIntegrationTokens } from "@/lib/integrations";
import { normalizePath, toBase64 } from "@/lib/deploy-server";
import { getRepoLookupTargets, normalizeNetlifySiteName, slugifyRepoName } from "@/lib/deploy-shared";
import { generateReadmeContent, generateRepoDescription } from "@/lib/repo-content";
import { getProject, getFiles } from "@/lib/projects";
import { getServerEnv } from "@/lib/env";
import { z } from "zod";
import { createSSEWriter } from "@/lib/sse";
import { validateOrigin } from "@/lib/csrf";
import { logger } from "@/lib/logger";

type DeployFile = {
  path: string;
  content: string;
};

type DeployRequest = {
  projectName: string;
  prompt?: string;
  files?: DeployFile[];
  repoVisibility?: "private" | "public";
  githubOrg?: string | null;
  deployMode?: "github-vercel" | "github-netlify" | "github-only";
  repoName?: string;
  repoFullName?: string;
  netlifySiteName?: string;
};

const deploySchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, "Invalid project name"),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  repoVisibility: z.enum(["private", "public"]).optional(),
  githubOrg: z.string().trim().min(1).max(120).nullable().optional(),
  deployMode: z.enum(["github-vercel", "github-netlify", "github-only"]).optional(),
  repoName: z.string().trim().min(1).max(120).optional(),
  repoFullName: z.string().trim().min(1).max(240).optional(),
  netlifySiteName: z.string().trim().min(1).max(120).optional(),
}).strict();

async function githubRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    let details = "";
    try {
      const json = await resp.json();
      details = json?.message ? `${json.message}${json.errors ? ` (${JSON.stringify(json.errors)})` : ""}` : JSON.stringify(json);
    } catch {
      details = await resp.text();
    }
    throw new Error(`GitHub API error: ${resp.status} ${details}`);
  }
  return (await resp.json()) as T;
}

async function vercelRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Vercel API error: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

async function netlifyRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Netlify API error: ${resp.status} ${text}`);
  }
  return (await resp.json()) as T;
}

export async function POST(req: Request) {
  // CSRF origin validation
  if (!validateOrigin(req as unknown as import('next/server').NextRequest)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    getServerEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid environment configuration";
    return Response.json({ error: message }, { status: 500 });
  }

  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = deploySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const body = parsed.data as DeployRequest;

  const project = await getProject(body.projectName);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  // Ownership check: if the project has a userId, only that user may deploy.
  // Legacy/guest projects (no userId) are restricted to their creator once adopted,
  // but orphaned ones are blocked entirely to prevent unauthorized deploys.
  if (project.userId) {
    if (project.userId !== user.id) {
      return Response.json({ error: "Unauthorized to deploy this project" }, { status: 403 });
    }
  } else {
    // Orphaned legacy project — no owner recorded.  Allow only if the project name
    // was just reserved by this user (i.e. the calling user is the creator).
    // For full safety, log a warning so we can migrate these projects.
    logger.warn('[deploy] Legacy project has no userId', { projectName: body.projectName, userId: user.id });
  }

  const storedFiles = await getFiles(body.projectName);
  if (storedFiles.length === 0) {
    return Response.json(
      { error: "No files to deploy. Please generate or add files to the project first." },
      { status: 400 }
    );
  }
  const deployFiles: DeployFile[] = storedFiles.map((file) => ({
    path: file.path,
    content: file.content,
  }));

  const deployMode =
    body.deployMode === "github-only"
      ? "github-only"
      : body.deployMode === "github-netlify"
        ? "github-netlify"
        : body.deployMode === "github-vercel"
          ? "github-vercel"
          : "github-netlify";

  const integrations = await getIntegrationTokens(user.id);
  if (!integrations?.githubAccessToken) {
    return Response.json({ error: "GitHub connection required" }, { status: 400 });
  }
  if (deployMode === "github-vercel" && !integrations?.vercelAccessToken) {
    return Response.json({ error: "Vercel connection required" }, { status: 400 });
  }
  if (deployMode === "github-netlify" && !integrations?.netlifyAccessToken) {
    return Response.json({ error: "Netlify connection required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const writer = createSSEWriter(controller);

      try {
        writer.write({ status: "progress", message: "Preparing repository details" });

        const githubToken = integrations.githubAccessToken!;
        const vercelToken = integrations.vercelAccessToken ?? "";
        const netlifyToken = integrations.netlifyAccessToken ?? "";

        const repoName = slugifyRepoName(body.repoName || body.projectName);
        const promptForContent = body.prompt?.trim() || "Generated by Mini App Factory";
        const targetOrg = body.githubOrg?.trim() || null;
        const isPrivate = body.repoVisibility !== "public";

        writer.write({ status: "progress", message: "GitHub: Fetching user details" });
        const viewer = await githubRequest<{ login: string }>("https://api.github.com/user", githubToken);
        const ownerLogin = targetOrg || viewer.login;
        const preferredFullName = body.repoFullName?.trim();

        let repo:
          | {
              name: string;
              full_name: string;
              default_branch: string;
              owner: { login: string };
              id: number;
            }
          | null = null;

        const repoLookupTargets = getRepoLookupTargets({
          preferredFullName,
          ownerLogin,
          repoName,
        });

        writer.write({ status: "progress", message: `GitHub: Checking repository ${repoName}` });
        for (const fullName of repoLookupTargets) {
          try {
            repo = await githubRequest(`https://api.github.com/repos/${fullName}`, githubToken);
            break;
          } catch (err) {
            const message = err instanceof Error ? err.message : "";
            if (!/GitHub API error: 404/i.test(message)) {
              throw err;
            }
          }
        }

        if (!repo) {
          writer.write({ status: "progress", message: "GitHub: Creating repository" });
          const description = await generateRepoDescription({
            projectName: body.projectName,
            prompt: body.prompt,
            files: deployFiles.map((file) => file.path),
          });
          const repoCreateUrl = targetOrg
            ? `https://api.github.com/orgs/${encodeURIComponent(targetOrg)}/repos`
            : "https://api.github.com/user/repos";
          repo = await githubRequest<{
            name: string;
            full_name: string;
            default_branch: string;
            owner: { login: string };
            id: number;
          }>(repoCreateUrl, githubToken, {
            method: "POST",
            body: JSON.stringify({
              name: repoName,
              private: isPrivate,
              description,
            }),
          });
        }

        const defaultBranch = repo.default_branch || "main";
        const owner = repo.owner?.login ?? viewer.login;

        const uploadFiles = [...deployFiles];
        const readmeExists = uploadFiles.some((f) => normalizePath(f.path).toLowerCase() === "readme.md");
        if (!readmeExists) {
          writer.write({ status: "progress", message: "GitHub: Generating README" });
          const readme = await generateReadmeContent({
            projectName: body.projectName,
            prompt: promptForContent,
            files: uploadFiles.map((file) => file.path),
          });
          uploadFiles.push({ path: "README.md", content: readme });
        }

        writer.write({
          status: "progress",
          message: `GitHub: Uploading ${uploadFiles.length} files in a single commit`,
        });

        // Create blobs for all files in parallel
        const blobResults = await Promise.all(
          uploadFiles
            .map((file) => ({ ...file, path: normalizePath(file.path) }))
            .filter((file) => file.path)
            .map(async (file) => {
              const blob = await githubRequest<{ sha: string }>(
                `https://api.github.com/repos/${owner}/${repo.name}/git/blobs`,
                githubToken,
                {
                  method: "POST",
                  body: JSON.stringify({
                    content: toBase64(file.content),
                    encoding: "base64",
                  }),
                }
              );
              return { path: file.path, sha: blob.sha };
            })
        );

        // Get the current commit SHA for the branch
        const branchRef = await githubRequest<{ object: { sha: string } }>(
          `https://api.github.com/repos/${owner}/${repo.name}/git/ref/heads/${encodeURIComponent(defaultBranch)}`,
          githubToken
        );
        const baseCommitSha = branchRef.object.sha;

        // Create tree
        const tree = await githubRequest<{ sha: string }>(
          `https://api.github.com/repos/${owner}/${repo.name}/git/trees`,
          githubToken,
          {
            method: "POST",
            body: JSON.stringify({
              base_tree: baseCommitSha,
              tree: blobResults.map((b) => ({
                path: b.path,
                mode: "100644",
                type: "blob",
                sha: b.sha,
              })),
            }),
          }
        );

        // Create commit
        const commit = await githubRequest<{ sha: string }>(
          `https://api.github.com/repos/${owner}/${repo.name}/git/commits`,
          githubToken,
          {
            method: "POST",
            body: JSON.stringify({
              message: `Deploy ${body.projectName} via Mini App Factory`,
              tree: tree.sha,
              parents: [baseCommitSha],
            }),
          }
        );

        // Update branch ref
        await githubRequest(
          `https://api.github.com/repos/${owner}/${repo.name}/git/refs/heads/${encodeURIComponent(defaultBranch)}`,
          githubToken,
          {
            method: "PATCH",
            body: JSON.stringify({ sha: commit.sha }),
          }
        );

        let deploymentUrl: string | undefined;
        if (deployMode === "github-vercel") {
          writer.write({ status: "progress", message: "Vercel: Creating deployment" });
          const deployment = await vercelRequest<{ url?: string; id?: string }>(
            "https://api.vercel.com/v13/deployments",
            vercelToken,
            {
              method: "POST",
              body: JSON.stringify({
                name: repoName,
                target: "production",
                gitSource: {
                  type: "github",
                  repoId: repo.id,
                  ref: defaultBranch,
                  repo: repo.name,
                  org: owner,
                },
              }),
            }
          );
          deploymentUrl = deployment.url ? `https://${deployment.url}` : undefined;
        }

        let netlifySiteName: string | undefined;
        if (deployMode === "github-netlify") {
          writer.write({ status: "progress", message: "Netlify: Configuring deploy keys" });
          const deployKey = await netlifyRequest<{ id: string; public_key: string }>(
            "https://api.netlify.com/api/v1/deploy_keys",
            netlifyToken,
            { method: "POST" }
          );

          try {
            await githubRequest(`https://api.github.com/repos/${owner}/${repo.name}/keys`, githubToken, {
              method: "POST",
              body: JSON.stringify({
                title: "Netlify Deploy Key",
                key: deployKey.public_key,
                read_only: true,
              }),
            });
          } catch {
            // Already exists or cant be added
          }

          writer.write({ status: "progress", message: "Netlify: Setting up GitHub webhook" });
          try {
            await githubRequest(`https://api.github.com/repos/${owner}/${repo.name}/hooks`, githubToken, {
              method: "POST",
              body: JSON.stringify({
                name: "web",
                active: true,
                events: ["push"],
                config: {
                  url: "https://api.netlify.com/hooks/github",
                  content_type: "json",
                },
              }),
            });
          } catch {
            // Already exists
          }

          writer.write({ status: "progress", message: "Netlify: Creating site" });
          const createNetlifySite = async (name: string) => {
            const resp = await fetch("https://api.netlify.com/api/v1/sites", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${netlifyToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name,
                repo: {
                  provider: "github",
                  repo: `${owner}/${repo.name}`,
                  private: isPrivate,
                  branch: defaultBranch,
                  deploy_key_id: deployKey.id,
                  repo_id: repo.id,
                },
              }),
            });
            if (!resp.ok) {
              const text = await resp.text();
              return { ok: false as const, status: resp.status, text };
            }
            const data = (await resp.json()) as { url?: string; ssl_url?: string; name?: string };
            return { ok: true as const, data };
          };

          const preferredSiteName = normalizeNetlifySiteName(body.netlifySiteName || repoName);
          let siteResult = await createNetlifySite(preferredSiteName);
          if (!siteResult.ok && siteResult.status === 422 && siteResult.text.includes("subdomain")) {
            const suffix = Math.random().toString(36).slice(2, 6);
            const fallbackName = `${preferredSiteName}-${suffix}`;
            siteResult = await createNetlifySite(fallbackName);
          }
          if (!siteResult.ok) {
            throw new Error(`Netlify API error: ${siteResult.status} ${siteResult.text}`);
          }

          const site = siteResult.data;
          deploymentUrl = site.ssl_url || site.url;
          netlifySiteName = site.name || preferredSiteName;
        }

        writer.write({
          status: "success",
          data: {
            repo: repo.full_name,
            repoUrl: `https://github.com/${repo.full_name}`,
            deploymentUrl,
            netlifySiteName,
          },
        });
      } catch (err) {
        writer.write({
          status: "error",
          message: err instanceof Error ? err.message : "Deploy failed",
        });
      } finally {
        writer.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
