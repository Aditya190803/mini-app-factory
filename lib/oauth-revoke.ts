import 'server-only';

/**
 * Best-effort revocation of a third-party OAuth token at the provider.
 *
 * Clearing our own database row only makes us forget the token — the grant stays valid at the
 * provider, so a token that leaked before disconnect keeps working indefinitely. Revoking closes
 * that window.
 *
 * Every function here is best-effort by design: disconnect must still succeed locally even if the
 * provider is unreachable or has already invalidated the grant. Failures are reported to the
 * caller for logging, never thrown.
 */

export type RevokeResult = { provider: string; revoked: boolean; reason?: string };

const TIMEOUT_MS = 5_000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GitHub: delete the whole authorization grant for this app/user.
 * Requires HTTP basic auth with the OAuth app's client id + secret.
 * https://docs.github.com/en/rest/apps/oauth-applications
 */
export async function revokeGithubToken(accessToken: string): Promise<RevokeResult> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { provider: 'github', revoked: false, reason: 'oauth_app_not_configured' };
  }

  try {
    const resp = await withTimeout((signal) =>
      fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
        signal,
      })
    );

    // 204 = revoked, 404 = already gone. Both mean "no longer valid", which is what we want.
    return { provider: 'github', revoked: resp.status === 204 || resp.status === 404 };
  } catch {
    return { provider: 'github', revoked: false, reason: 'request_failed' };
  }
}

/** Netlify: DELETE the current ticket/token. https://docs.netlify.com/api/get-started/ */
export async function revokeNetlifyToken(accessToken: string): Promise<RevokeResult> {
  try {
    const resp = await withTimeout((signal) =>
      fetch('https://api.netlify.com/api/v1/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: accessToken }),
        signal,
      })
    );
    return { provider: 'netlify', revoked: resp.ok || resp.status === 404 };
  } catch {
    return { provider: 'netlify', revoked: false, reason: 'request_failed' };
  }
}

/**
 * Vercel has no public token-revocation endpoint for OAuth integration tokens — the grant is
 * removed by uninstalling the integration from the Vercel dashboard. Recorded explicitly so the
 * gap is visible rather than looking like an oversight.
 */
export async function revokeVercelToken(_accessToken: string): Promise<RevokeResult> {
  return { provider: 'vercel', revoked: false, reason: 'no_revocation_endpoint' };
}

/** User-created API tokens must be revoked from Cloudflare's API Tokens dashboard. */
export async function revokeCloudflareToken(_accessToken: string): Promise<RevokeResult> {
  return { provider: 'cloudflare', revoked: false, reason: 'revoke_in_cloudflare_dashboard' };
}
