import { stackServerApp } from '@/stack/server';
import { createOAuthStateCookie, createPkcePair, getBaseUrl, sanitizeReturnTo } from '@/lib/oauth';
import { createCloudflareAuthorizationUrl, isCloudflareOAuthConfigured } from '@/lib/cloudflare-oauth';

const COOKIE_NAME = 'oauth_cloudflare_state';

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const returnTo = sanitizeReturnTo(new URL(req.url).searchParams.get('returnTo'));
  const baseUrl = await getBaseUrl();

  if (!isCloudflareOAuthConfigured()) {
    const dest = new URL(returnTo, baseUrl);
    dest.searchParams.set('cloudflareError', 'oauth-unconfigured');
    return Response.redirect(dest.toString());
  }

  try {
    const pkce = createPkcePair();
    const state = await createOAuthStateCookie(COOKIE_NAME, returnTo, pkce.verifier);
    const redirectUri = `${baseUrl}/api/integrations/cloudflare/callback`;
    return Response.redirect(createCloudflareAuthorizationUrl({ state, redirectUri, codeChallenge: pkce.challenge }).toString());
  } catch (error) {
    const dest = new URL(returnTo, baseUrl);
    console.error('[cloudflare-oauth] start failed', error instanceof Error ? error.message : error);
    dest.searchParams.set('cloudflareError', 'oauth-unavailable');
    return Response.redirect(dest.toString());
  }
}
