import { stackServerApp } from "@/stack/server";
import { getIntegrationTokens } from "@/lib/integrations";
import { normalizePath } from "@/lib/deploy-server";
import { commitGitHubTree, createGitHubRepo, findGitHubRepo, githubRequest, type GitHubRepo } from "@/lib/github";
import { ensureNetlifySiteForRepo } from "@/lib/netlify";
import { getRepoLookupTargets, normalizeNetlifySiteName, slugifyRepoName } from "@/lib/deploy-shared";
import { generateReadmeContent, generateRepoDescription } from "@/lib/repo-content";
import { getProject, getFiles } from "@/lib/projects";
import { getServerEnv } from "@/lib/env";
import { assertProjectRole } from "@/lib/project-access";
import { createSSEWriter } from "@/lib/sse-writer";
import { consumeRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { reportError } from "@/lib/error-reporting";
import { z } from "zod";
import { deployProjectToCloudflare } from "@/lib/cloudflare-deploy";

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
  deployMode?: "github-netlify" | "github-only" | "cloudflare";
  repoName?: string;
  cloudflareProjectName?: string;
  confirmCloudflareResources?: boolean;
  repoFullName?: string;
  netlifySiteName?: string;
};

/**
 * Cloudflare deploys upload every asset and provision resources, and the GitHub path generates a
 * README with the model, so wall time can be long. Matches the generate and transform routes.
 */
export const maxDuration = 300;

const deploySchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, "Invalid project name"),
  prompt: z.string().trim().min(1).max(8_000).optional(),
  repoVisibility: z.enum(["private", "public"]).optional(),
  githubOrg: z.string().trim().min(1).max(120).nullable().optional(),
  deployMode: z.enum(["github-netlify", "github-only", "cloudflare"]).optional(),
  repoName: z.string().trim().min(1).max(120).optional(),
  cloudflareProjectName: z.string().trim().min(1).max(58).optional(),
  confirmCloudflareResources: z.boolean().optional(),
  repoFullName: z.string().trim().min(1).max(240).optional(),
  netlifySiteName: z.string().trim().min(1).max(120).optional(),
}).strict();

export async function POST(req: Request) {
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
  const deployMode = body.deployMode ?? "github-netlify";
  // Cloudflare resources live in the owner's account and the project records their IDs, so only
  // the owner deploys there. GitHub and Netlify use the caller's own tokens, so editors may.
  const access = assertProjectRole(project, user.id, deployMode === "cloudflare" ? "owner" : "editor");
  if (!access.ok) {
    return Response.json({ error: access.message }, { status: access.status });
  }

  const rateLimit = await consumeRateLimit("deploy", user.id);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

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

  const integrations = await getIntegrationTokens();
  if (deployMode === "cloudflare") {
    if (!integrations?.cloudflareApiToken || !integrations.cloudflareAccountId) {
      return Response.json({ error: "Cloudflare connection required" }, { status: 400 });
    }
  } else if (!integrations?.githubAccessToken) {
    return Response.json({ error: "GitHub connection required" }, { status: 400 });
  }
  if (deployMode === "github-netlify" && !integrations?.netlifyAccessToken) {
    return Response.json({ error: "Netlify connection required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const writer = createSSEWriter(controller);

      try {
        if (deployMode === "cloudflare") {
          const result = await deployProjectToCloudflare({
            token: integrations.cloudflareApiToken!,
            accountId: integrations.cloudflareAccountId!,
            requestedProjectName: body.cloudflareProjectName,
            project: project!,
            files: deployFiles,
            allowResourceCreation: body.confirmCloudflareResources,
            onProgress: (message) => writer.write({ status: "progress", message }),
          });
          writer.write({ status: "success", data: result });
          return;
        }

        writer.write({ status: "progress", message: "Preparing repository details" });

        const githubToken = integrations.githubAccessToken!;
        const netlifyToken = integrations.netlifyAccessToken ?? "";

        const repoName = slugifyRepoName(body.repoName || body.projectName);
        const promptForContent = body.prompt?.trim() || "Generated by Mini App Factory";
        const targetOrg = body.githubOrg?.trim() || null;
        const isPrivate = body.repoVisibility !== "public";

        writer.write({ status: "progress", message: "GitHub: Fetching user details" });
        const viewer = await githubRequest<{ login: string }>("/user", githubToken);
        const ownerLogin = targetOrg || viewer.login;

        let repo: GitHubRepo | null = null;
        writer.write({ status: "progress", message: `GitHub: Checking repository ${repoName}` });
        for (const fullName of getRepoLookupTargets({ preferredFullName: body.repoFullName?.trim(), ownerLogin, repoName })) {
          repo = await findGitHubRepo(fullName, githubToken);
          if (repo) break;
        }

        if (!repo) {
          writer.write({ status: "progress", message: "GitHub: Creating repository" });
          const description = await generateRepoDescription({
            projectName: body.projectName,
            prompt: body.prompt,
            files: deployFiles.map((file) => file.path),
          });
          repo = await createGitHubRepo({ token: githubToken, org: targetOrg, name: repoName, isPrivate, description });
        }

        const defaultBranch = repo.default_branch || "main";
        const owner = repo.owner?.login ?? viewer.login;

        const uploadFiles = deployFiles
          .map((file) => ({ path: normalizePath(file.path), content: file.content }))
          .filter((file) => file.path);
        const readmeExists = uploadFiles.some((f) => f.path.toLowerCase() === "readme.md");
        if (!readmeExists) {
          writer.write({ status: "progress", message: "GitHub: Generating README" });
          const readme = await generateReadmeContent({
            projectName: body.projectName,
            prompt: promptForContent,
            files: uploadFiles.map((file) => file.path),
          });
          uploadFiles.push({ path: "README.md", content: readme });
        }

        writer.write({ status: "progress", message: `GitHub: Committing ${uploadFiles.length} files` });
        await commitGitHubTree({
          token: githubToken,
          repo: `${owner}/${repo.name}`,
          branch: defaultBranch,
          files: uploadFiles,
          message: "Deploy from Mini App Factory",
        });

        let deploymentUrl: string | undefined;
        let netlifySiteName: string | undefined;
        if (deployMode === "github-netlify") {
          const site = await ensureNetlifySiteForRepo({
            netlifyToken,
            githubToken,
            existingSiteName: project!.netlifySiteName,
            preferredSiteName: normalizeNetlifySiteName(body.netlifySiteName || repoName),
            repo: { id: repo.id, name: repo.name, owner, branch: defaultBranch, isPrivate },
            onProgress: (message) => writer.write({ status: "progress", message }),
          });
          deploymentUrl = site.url;
          netlifySiteName = site.name;
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
        await reportError(err, { source: `deploy:${deployMode}`, project: body.projectName });
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
