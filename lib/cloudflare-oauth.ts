import 'server-only';

const AUTHORIZATION_URL = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';

export type CloudflareOAuthToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};

function credentials() {
  const clientId = process.env.CLOUDFLARE_CLIENT_ID;
  const clientSecret = process.env.CLOUDFLARE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Cloudflare OAuth is not configured');
  return { clientId, clientSecret };
}

function parseToken(value: unknown): CloudflareOAuthToken {
  const data = value as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description || data.error || 'Cloudflare did not return an access token');
  const expiresIn = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: data.scope,
  };
}

async function tokenRequest(params: URLSearchParams) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Cloudflare authorization failed');
  return parseToken(data);
}

export function createCloudflareAuthorizationUrl(params: { state: string; redirectUri: string }) {
  const { clientId } = credentials();
  const scopes = process.env.CLOUDFLARE_OAUTH_SCOPES?.trim();
  if (!scopes) throw new Error('CLOUDFLARE_OAUTH_SCOPES is not configured');
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', params.state);
  return url;
}

export function exchangeCloudflareCode(params: { code: string; redirectUri: string }) {
  return tokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  }));
}

export function refreshCloudflareAccessToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }));
}

export async function revokeCloudflareOAuthToken(token: string) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ token }),
  });
  return response.ok;
}
