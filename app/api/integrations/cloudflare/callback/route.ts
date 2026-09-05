import { stackServerApp } from '@/stack/server';
import { listCloudflareAccounts } from '@/lib/cloudflare';
import { exchangeCloudflareCode } from '@/lib/cloudflare-oauth';
import { upsertIntegrationTokens } from '@/lib/integrations';
import { consumeOAuthStateCookie, getBaseUrl } from '@/lib/oauth';

const COOKIE_NAME = 'oauth_cloudflare_state';

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  if (providerError) return Response.json({ error: 'Cloudflare authorization was denied' }, { status: 400 });
  if (!state || !code) return Response.json({ error: 'Missing code or state' }, { status: 400 });

  const returnTo = await consumeOAuthStateCookie(COOKIE_NAME, state);
  if (!returnTo) return Response.json({ error: 'Invalid or expired OAuth state' }, { status: 400 });

  try {
    const baseUrl = await getBaseUrl();
    const token = await exchangeCloudflareCode({ code, redirectUri: `${baseUrl}/api/integrations/cloudflare/callback` });
    const accounts = await listCloudflareAccounts(token.accessToken);
    if (!accounts.length) return Response.json({ error: 'No Cloudflare account was authorized' }, { status: 400 });
    const account = accounts[0];

    await upsertIntegrationTokens({
      cloudflareApiToken: token.accessToken,
      cloudflareRefreshToken: token.refreshToken,
      cloudflareTokenExpiresAt: token.expiresAt,
      cloudflareOAuthScope: token.scope,
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    });

    const redirectUrl = new URL(returnTo, baseUrl);
    redirectUrl.searchParams.set('connected', 'cloudflare');
    if (accounts.length > 1) redirectUrl.searchParams.set('cloudflareAccounts', String(accounts.length));
    return Response.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('[cloudflare-oauth] callback failed', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Cloudflare authorization failed' }, { status: 500 });
  }
}
