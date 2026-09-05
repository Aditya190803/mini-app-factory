import { api } from "@/convex/_generated/api";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { getAuthedConvexClient } from "@/lib/convex-server";
import { refreshCloudflareAccessToken } from '@/lib/cloudflare-oauth';

export interface IntegrationStatus {
  githubConnected: boolean;
  vercelConnected: boolean;
  netlifyConnected: boolean;
  cloudflareConnected: boolean;
  githubConnectedAt?: number;
  vercelConnectedAt?: number;
  netlifyConnectedAt?: number;
  cloudflareConnectedAt?: number;
  cloudflareAccountId?: string;
  cloudflareAccountName?: string;
}

/**
 * Read a user's integration record with access tokens decrypted.
 *
 * This and `upsertIntegrationTokens` are the only places tokens cross the Convex boundary, which
 * is why encryption lives here rather than in each OAuth callback. A token that fails to decrypt
 * (rotated INTEGRATION_TOKEN_SECRET, tampered row) comes back as undefined, so callers treat it
 * as "not connected" and the user is prompted to reconnect.
 */
export async function getIntegrationTokens() {
  const convex = await getAuthedConvexClient();
  const integration = await convex.query(api.integrations.getIntegration, {});
  if (!integration) return null;

  let cloudflareApiToken = decryptSecret(integration.cloudflareApiToken) ?? undefined;
  let cloudflareRefreshToken = decryptSecret(integration.cloudflareRefreshToken) ?? undefined;
  let cloudflareTokenExpiresAt = integration.cloudflareTokenExpiresAt;
  let cloudflareOAuthScope = integration.cloudflareOAuthScope;

  if (cloudflareApiToken && cloudflareRefreshToken && cloudflareTokenExpiresAt && cloudflareTokenExpiresAt <= Date.now() + 60_000) {
    const refreshed = await refreshCloudflareAccessToken(cloudflareRefreshToken);
    cloudflareApiToken = refreshed.accessToken;
    cloudflareRefreshToken = refreshed.refreshToken || cloudflareRefreshToken;
    cloudflareTokenExpiresAt = refreshed.expiresAt;
    cloudflareOAuthScope = refreshed.scope || cloudflareOAuthScope;
    await convex.mutation(api.integrations.updateCloudflareOAuthToken, {
      cloudflareApiToken: encryptSecret(cloudflareApiToken),
      cloudflareRefreshToken: encryptSecret(cloudflareRefreshToken),
      cloudflareTokenExpiresAt,
      cloudflareOAuthScope,
    });
  }

  return {
    ...integration,
    tokenVersions: {
      github: integration.githubAccessToken,
      vercel: integration.vercelAccessToken,
      netlify: integration.netlifyAccessToken,
      cloudflare: integration.cloudflareApiToken,
    },
    githubAccessToken: decryptSecret(integration.githubAccessToken) ?? undefined,
    vercelAccessToken: decryptSecret(integration.vercelAccessToken) ?? undefined,
    netlifyAccessToken: decryptSecret(integration.netlifyAccessToken) ?? undefined,
    cloudflareApiToken,
    cloudflareRefreshToken,
    cloudflareTokenExpiresAt,
    cloudflareOAuthScope,
  };
}

export async function upsertIntegrationTokens(params: {
  githubAccessToken?: string;
  vercelAccessToken?: string;
  netlifyAccessToken?: string;
  cloudflareApiToken?: string;
  cloudflareRefreshToken?: string;
  cloudflareTokenExpiresAt?: number;
  cloudflareOAuthScope?: string;
  cloudflareTokenId?: string;
  cloudflareAccountId?: string;
  cloudflareAccountName?: string;
}) {
  const convex = await getAuthedConvexClient();
  await convex.mutation(api.integrations.upsertIntegration, {
    githubAccessToken:
      params.githubAccessToken === undefined ? undefined : encryptSecret(params.githubAccessToken),
    vercelAccessToken:
      params.vercelAccessToken === undefined ? undefined : encryptSecret(params.vercelAccessToken),
    netlifyAccessToken:
      params.netlifyAccessToken === undefined ? undefined : encryptSecret(params.netlifyAccessToken),
    cloudflareApiToken:
      params.cloudflareApiToken === undefined ? undefined : encryptSecret(params.cloudflareApiToken),
    cloudflareRefreshToken:
      params.cloudflareRefreshToken === undefined ? undefined : encryptSecret(params.cloudflareRefreshToken),
    cloudflareTokenExpiresAt: params.cloudflareTokenExpiresAt,
    cloudflareOAuthScope: params.cloudflareOAuthScope,
    cloudflareTokenId: params.cloudflareTokenId,
    cloudflareAccountId: params.cloudflareAccountId,
    cloudflareAccountName: params.cloudflareAccountName,
  });
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const integration = await getIntegrationTokens();
  return {
    githubConnected: !!integration?.githubAccessToken,
    vercelConnected: !!integration?.vercelAccessToken,
    netlifyConnected: !!integration?.netlifyAccessToken,
    cloudflareConnected: !!integration?.cloudflareApiToken && !!integration?.cloudflareAccountId,
    githubConnectedAt: integration?.githubConnectedAt,
    vercelConnectedAt: integration?.vercelConnectedAt,
    netlifyConnectedAt: integration?.netlifyConnectedAt,
    cloudflareConnectedAt: integration?.cloudflareConnectedAt,
    cloudflareAccountId: integration?.cloudflareAccountId,
    cloudflareAccountName: integration?.cloudflareAccountName,
  };
}
