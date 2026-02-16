import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { encryptToken, decryptToken, isEncryptionAvailable } from "./token-encryption";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface IntegrationStatus {
  githubConnected: boolean;
  vercelConnected: boolean;
  netlifyConnected: boolean;
  githubConnectedAt?: number;
  vercelConnectedAt?: number;
  netlifyConnectedAt?: number;
}

export async function getIntegrationTokens(userId: string) {
  const integration = await convex.query(api.integrations.getIntegration, { userId });
  if (!integration) return null;
  // Decrypt tokens transparently (backward-compatible with unencrypted values)
  return {
    ...integration,
    githubAccessToken: integration.githubAccessToken ? decryptToken(integration.githubAccessToken) : undefined,
    vercelAccessToken: integration.vercelAccessToken ? decryptToken(integration.vercelAccessToken) : undefined,
    netlifyAccessToken: integration.netlifyAccessToken ? decryptToken(integration.netlifyAccessToken) : undefined,
  };
}

export async function upsertIntegrationTokens(params: {
  userId: string;
  githubAccessToken?: string;
  vercelAccessToken?: string;
  netlifyAccessToken?: string;
}) {
  const encrypt = isEncryptionAvailable();
  await convex.mutation(api.integrations.upsertIntegration, {
    userId: params.userId,
    githubAccessToken: params.githubAccessToken
      ? (encrypt ? encryptToken(params.githubAccessToken) : params.githubAccessToken)
      : undefined,
    vercelAccessToken: params.vercelAccessToken
      ? (encrypt ? encryptToken(params.vercelAccessToken) : params.vercelAccessToken)
      : undefined,
    netlifyAccessToken: params.netlifyAccessToken
      ? (encrypt ? encryptToken(params.netlifyAccessToken) : params.netlifyAccessToken)
      : undefined,
  });
}

export async function getIntegrationStatus(userId: string): Promise<IntegrationStatus> {
  const integration = await getIntegrationTokens(userId);
  return {
    githubConnected: !!integration?.githubAccessToken,
    vercelConnected: !!integration?.vercelAccessToken,
    netlifyConnected: !!integration?.netlifyAccessToken,
    githubConnectedAt: integration?.githubConnectedAt,
    vercelConnectedAt: integration?.vercelConnectedAt,
    netlifyConnectedAt: integration?.netlifyConnectedAt,
  };
}
