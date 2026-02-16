import { stackServerApp } from "@/stack/server";
import { createOAuthStateCookie, getBaseUrl, sanitizeReturnTo } from "@/lib/oauth";
import { validateOrigin } from "@/lib/csrf";

const COOKIE_NAME = "oauth_vercel_state";

export async function GET(req: Request) {
  if (!validateOrigin(req as unknown as import('next/server').NextRequest)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
  const state = await createOAuthStateCookie(COOKIE_NAME, returnTo);
  const baseUrl = await getBaseUrl();

  const clientId = process.env.VERCEL_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Missing VERCEL_CLIENT_ID" }, { status: 500 });
  }

  const redirectUri = `${baseUrl}/api/integrations/vercel/callback`;
  const authUrl = new URL("https://vercel.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "read write deploy");

  return Response.redirect(authUrl.toString());
}
