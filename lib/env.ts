import "server-only";

import { z } from "zod";

const optional = z.string().trim().optional();

/**
 * Credentials that only work in pairs. Setting one without the other used to fail at the moment
 * a user tried to connect, rather than at deploy time.
 */
const PAIRS: Array<[string, string]> = [
  ["AI_GATEWAY_API_KEY", "AI_GATEWAY_BASE_URL"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ["NETLIFY_CLIENT_ID", "NETLIFY_CLIENT_SECRET"],
  ["CLOUDFLARE_CLIENT_ID", "CLOUDFLARE_CLIENT_SECRET"],
];

const serverEnvSchema = z
  .object({
    OPENCODE_API_KEY: optional,
    OPENCODE_MODEL: optional,
    OPENCODE_FALLBACK_MODEL: optional,
    AI_GATEWAY_BASE_URL: z.string().trim().url().optional().or(z.literal("")),
    AI_GATEWAY_API_KEY: optional,
    AI_GATEWAY_MODEL: optional,
    NEXT_PUBLIC_APP_URL: z.string().trim().url("NEXT_PUBLIC_APP_URL must be a full URL").optional().or(z.literal("")),
    NEXT_PUBLIC_CONVEX_URL: z.string().min(1, "NEXT_PUBLIC_CONVEX_URL is required"),
    NEXT_PUBLIC_STACK_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_STACK_PROJECT_ID is required"),
    NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: z
      .string()
      .min(1, "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY is required"),
    STACK_SECRET_SERVER_KEY: z.string().min(1, "STACK_SECRET_SERVER_KEY is required"),
    INTEGRATION_TOKEN_SECRET: z
      .string()
      .min(32, "INTEGRATION_TOKEN_SECRET must be at least 32 characters")
      .optional(),
    EXA_API_KEY: optional,
    MAF_ADMIN_EMAILS: optional,
    CLOUDFLARE_CLIENT_ID: optional,
    CLOUDFLARE_CLIENT_SECRET: optional,
    CLOUDFLARE_OAUTH_SCOPES: optional,
    GITHUB_CLIENT_ID: optional,
    GITHUB_CLIENT_SECRET: optional,
    NETLIFY_CLIENT_ID: optional,
    NETLIFY_CLIENT_SECRET: optional,
    ERROR_REPORT_WEBHOOK_URL: z.string().trim().url().optional().or(z.literal("")),
  })
  .superRefine((env, ctx) => {
    // No "at least one AI key" rule: a deployment may run on users' own keys (BYOK) alone.
    // lib/ai-client.ts reports a missing provider per request instead.
    const values = env as Record<string, string | undefined>;
    for (const [a, b] of PAIRS) {
      if (Boolean(values[a]) !== Boolean(values[b])) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [values[a] ? b : a], message: `${a} and ${b} must be set together` });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
