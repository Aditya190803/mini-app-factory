import { stackServerApp } from "@/stack/server";
import { consumeOAuthStateCookie, getBaseUrl } from "@/lib/oauth";
import { upsertIntegrationTokens } from "@/lib/integrations";

const COOKIE_NAME = "oauth_github_state";

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.json({ error: "Missing code or state" }, { status: 400 });
  }

  const returnTo = await consumeOAuthStateCookie(COOKIE_NAME, state);
  if (!returnTo) {
    return Response.json({ error: "Invalid state" }, { status: 400 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Missing GitHub OAuth credentials" }, { status: 500 });
  }

  const redirectUri = `${await getBaseUrl()}/api/integrations/github/callback`;
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResp.ok) {
    const errorText = await tokenResp.text();
    return Response.json({ error: "GitHub token exchange failed", details: errorText }, { status: 500 });
  }

  const tokenData = (await tokenResp.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (tokenData.error) {
    console.error("GitHub OAuth error:", tokenData.error, tokenData.error_description);
    return Response.json({ error: "GitHub token exchange failed" }, { status: 500 });
  }
  if (!tokenData.access_token) {
    return Response.json({ error: "Missing access token" }, { status: 500 });
  }

  await upsertIntegrationTokens({
    userId: user.id,
    githubAccessToken: tokenData.access_token,
  });

  const redirectUrl = new URL(returnTo, await getBaseUrl());
  redirectUrl.searchParams.set("connected", "github");
  return Response.redirect(redirectUrl.toString());
}
