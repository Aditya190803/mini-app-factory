import { stackServerApp } from "@/stack/server";
import { getIntegrationTokens } from "@/lib/integrations";

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  const ownerParam = url.searchParams.get("owner")?.trim() || null;

  if (!name) {
    return Response.json({ error: "Missing repo name" }, { status: 400 });
  }

  const integrations = await getIntegrationTokens(user.id);
  if (!integrations?.githubAccessToken) {
    return Response.json({ error: "GitHub connection required" }, { status: 400 });
  }

  const token = integrations.githubAccessToken;

  let owner = ownerParam;
  if (!owner) {
    const viewerResp = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!viewerResp.ok) {
      const text = await viewerResp.text();
      return Response.json({ error: "GitHub API error", details: text }, { status: 500 });
    }
    const viewer = (await viewerResp.json()) as { login: string };
    owner = viewer.login;
  }

  const repoResp = await fetch(`https://api.github.com/repos/${owner}/${encodeURIComponent(name)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (repoResp.status === 404) {
    return Response.json({ available: true, owner });
  }

  if (repoResp.ok) {
    return Response.json({ available: false, owner });
  }

  const text = await repoResp.text();
  return Response.json({ error: "GitHub API error", details: text }, { status: 500 });
}
