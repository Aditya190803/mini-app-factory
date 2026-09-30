import { stackServerApp } from "@/stack/server";
import { consumeOAuthStateCookie, getBaseUrl } from "@/lib/oauth";
import { upsertIntegrationTokens } from "@/lib/integrations";

const COOKIE_NAME = "oauth_netlify_state";

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

  const clientId = process.env.NETLIFY_CLIENT_ID;
  const clientSecret = process.env.NETLIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "Missing Netlify OAuth credentials" }, { status: 500 });
  }

  const redirectUri = `${await getBaseUrl()}/api/integrations/netlify/callback`;
  const tokenResp = await fetch("https://api.netlify.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResp.ok) {
    // Log, don't return: the upstream body can echo request details.
    console.error("Netlify token exchange failed:", tokenResp.status, await tokenResp.text().catch(() => ""));
    return Response.json({ error: "Netlify token exchange failed" }, { status: 502 });
  }

  const tokenData = (await tokenResp.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return Response.json({ error: "Missing access token" }, { status: 500 });
  }

  await upsertIntegrationTokens({
    netlifyAccessToken: tokenData.access_token,
  });

  const redirectUrl = new URL(returnTo, await getBaseUrl());
  redirectUrl.searchParams.set("connected", "netlify");
  return Response.redirect(redirectUrl.toString());
}
