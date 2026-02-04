import { stackServerApp } from "@/stack/server";
import { getIntegrationTokens } from "@/lib/integrations";

type GithubOrg = {
  login: string;
  id: number;
};

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integrations = await getIntegrationTokens(user.id);
  if (!integrations?.githubAccessToken) {
    return Response.json({ error: "GitHub not connected" }, { status: 400 });
  }

  const resp = await fetch("https://api.github.com/user/orgs", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${integrations.githubAccessToken}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    return Response.json({ error: "GitHub org lookup failed", details: text }, { status: 500 });
  }

  const orgs = (await resp.json()) as GithubOrg[];
  return Response.json({ orgs: orgs.map((org) => org.login) });
}
