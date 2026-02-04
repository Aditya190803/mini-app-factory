import { stackServerApp } from "@/stack/server";
import { createOAuthStateCookie, getBaseUrl, sanitizeReturnTo } from "@/lib/oauth";

const COOKIE_NAME = "oauth_github_state";

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
  const state = await createOAuthStateCookie(COOKIE_NAME, returnTo);
  const baseUrl = await getBaseUrl();

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Missing GITHUB_CLIENT_ID" }, { status: 500 });
  }

  const redirectUri = `${baseUrl}/api/integrations/github/callback`;
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "repo");

  return Response.redirect(authUrl.toString());
}
