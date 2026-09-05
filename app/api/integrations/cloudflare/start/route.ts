import { stackServerApp } from '@/stack/server';
import { createOAuthStateCookie, getBaseUrl, sanitizeReturnTo } from '@/lib/oauth';
import { createCloudflareAuthorizationUrl } from '@/lib/cloudflare-oauth';

const COOKIE_NAME = 'oauth_cloudflare_state';

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const returnTo = sanitizeReturnTo(new URL(req.url).searchParams.get('returnTo'));
    const state = await createOAuthStateCookie(COOKIE_NAME, returnTo);
    const redirectUri = `${await getBaseUrl()}/api/integrations/cloudflare/callback`;
    return Response.redirect(createCloudflareAuthorizationUrl({ state, redirectUri }).toString());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Cloudflare OAuth is unavailable' }, { status: 500 });
  }
}
