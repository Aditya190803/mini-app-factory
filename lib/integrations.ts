import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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
  return integration ?? null;
}

export async function upsertIntegrationTokens(params: {
  userId: string;
  githubAccessToken?: string;
  vercelAccessToken?: string;
  netlifyAccessToken?: string;
}) {
  await convex.mutation(api.integrations.upsertIntegration, params);
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
