import { stackServerApp } from "@/stack/server";
import { api } from "@/convex/_generated/api";
import { z } from "zod";
import { getIntegrationTokens } from "@/lib/integrations";
import { getAuthedConvexClient } from "@/lib/convex-server";
import { revokeCloudflareToken, revokeGithubToken, revokeNetlifyToken, revokeVercelToken } from "@/lib/oauth-revoke";
const disconnectSchema = z
  .object({
    provider: z.enum(["github", "vercel", "netlify", "cloudflare", "all"]).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider: "github" | "vercel" | "netlify" | "cloudflare" | "all" = "all";
  try {
    const parsed = disconnectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid provider" }, { status: 400 });
    }
    if (parsed.data.provider) {
      provider = parsed.data.provider;
    }
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Revoke at the provider before forgetting the token locally. Once the row is cleared we no
  // longer have the value, so the grant would stay live forever — which is exactly the window an
  // already-leaked token needs. Best-effort: a provider being down must not block disconnect.
  const wants = (p: string) => provider === 'all' || provider === p;
  try {
    const tokens = await getIntegrationTokens();
    if (tokens) {
      const revocations = [
        wants('github') && tokens.githubAccessToken
          ? revokeGithubToken(tokens.githubAccessToken)
          : null,
        wants('netlify') && tokens.netlifyAccessToken
          ? revokeNetlifyToken(tokens.netlifyAccessToken)
          : null,
        wants('vercel') && tokens.vercelAccessToken
          ? revokeVercelToken(tokens.vercelAccessToken)
          : null,
        wants('cloudflare') && tokens.cloudflareApiToken
          ? revokeCloudflareToken(tokens.cloudflareApiToken)
          : null,
      ].filter(Boolean) as Promise<{ provider: string; revoked: boolean; reason?: string }>[];

      const results = await Promise.all(revocations);
      for (const result of results) {
        if (!result.revoked) {
          console.warn(
            `[disconnect] could not revoke ${result.provider} token: ${result.reason ?? 'unknown'}`
          );
        }
      }
    }
  } catch (err) {
    console.warn('[disconnect] revocation step failed', err instanceof Error ? err.message : err);
  }

  const convex = await getAuthedConvexClient();
  await convex.mutation(api.integrations.clearIntegration, { provider });

  return Response.json({ success: true });
}
