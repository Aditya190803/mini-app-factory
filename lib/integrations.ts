import { api } from "@/convex/_generated/api";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import { getAuthedConvexClient } from "@/lib/convex-server";

export interface IntegrationStatus {
  githubConnected: boolean;
  vercelConnected: boolean;
  netlifyConnected: boolean;
  githubConnectedAt?: number;
  vercelConnectedAt?: number;
  netlifyConnectedAt?: number;
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

  return {
    ...integration,
    githubAccessToken: decryptSecret(integration.githubAccessToken) ?? undefined,
    vercelAccessToken: decryptSecret(integration.vercelAccessToken) ?? undefined,
    netlifyAccessToken: decryptSecret(integration.netlifyAccessToken) ?? undefined,
  };
}

export async function upsertIntegrationTokens(params: {
  githubAccessToken?: string;
  vercelAccessToken?: string;
  netlifyAccessToken?: string;
}) {
  const convex = await getAuthedConvexClient();
  await convex.mutation(api.integrations.upsertIntegration, {
    githubAccessToken:
      params.githubAccessToken === undefined ? undefined : encryptSecret(params.githubAccessToken),
    vercelAccessToken:
      params.vercelAccessToken === undefined ? undefined : encryptSecret(params.vercelAccessToken),
    netlifyAccessToken:
      params.netlifyAccessToken === undefined ? undefined : encryptSecret(params.netlifyAccessToken),
  });
}

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const integration = await getIntegrationTokens();
  return {
    githubConnected: !!integration?.githubAccessToken,
    vercelConnected: !!integration?.vercelAccessToken,
    netlifyConnected: !!integration?.netlifyAccessToken,
    githubConnectedAt: integration?.githubConnectedAt,
    vercelConnectedAt: integration?.vercelConnectedAt,
    netlifyConnectedAt: integration?.netlifyConnectedAt,
  };
}
