import "server-only";

import { z } from "zod";

const serverEnvSchema = z
  .object({
    CEREBRAS_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    CEREBRAS_MODEL: z.string().optional(),
    GROQ_MODEL: z.string().optional(),
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
  })
  .refine((data) => data.CEREBRAS_API_KEY || data.GROQ_API_KEY, {
    message: "At least one AI provider key must be configured (CEREBRAS_API_KEY or GROQ_API_KEY).",
    path: ["CEREBRAS_API_KEY"],
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
