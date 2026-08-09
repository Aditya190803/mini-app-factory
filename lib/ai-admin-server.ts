import type { AIAdminConfig, ProviderBYOKConfig } from '@/lib/ai-admin-config';

/**
 * Resolved AI configuration for a single server-side run.
 *
 * This is always built from Convex-persisted settings (see `lib/ai-settings-store.ts`) — never
 * from request headers. A previous `getRuntimeAIConfigFromRequest` helper read an
 * `x-maf-ai-byok` header; it had no callers and has been removed along with the client that
 * sent it. Do not reintroduce a header-supplied variant: it would let a caller inject provider
 * credentials and admin overrides into a server run.
 */
export type AIRuntimeConfig = {
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
};
