import {
  DEFAULT_AI_ADMIN_CONFIG,
  type AIAdminConfig,
  type ProviderBYOKConfig,
  fromBase64JSON,
  sanitizeAIAdminConfig,
  sanitizeBYOKConfig,
} from '@/lib/ai-admin-config';

export type AIRuntimeConfig = {
  adminConfig: AIAdminConfig;
  byokConfig: ProviderBYOKConfig;
};

export function getRuntimeAIConfigFromRequest(
  request: Request,
  options?: { isAdmin?: boolean; isAuthenticated?: boolean }
): AIRuntimeConfig {
  const adminEncoded = request.headers.get('x-maf-ai-config');
  const byokEncoded = request.headers.get('x-maf-ai-byok');

  const adminConfig = options?.isAdmin
    ? sanitizeAIAdminConfig(fromBase64JSON<unknown>(adminEncoded) ?? DEFAULT_AI_ADMIN_CONFIG)
    : DEFAULT_AI_ADMIN_CONFIG;

  const byokConfig = options?.isAuthenticated
    ? sanitizeBYOKConfig(fromBase64JSON<unknown>(byokEncoded))
    : {};

  return {
    adminConfig,
    byokConfig,
  };
}
