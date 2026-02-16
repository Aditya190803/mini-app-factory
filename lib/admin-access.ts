/**
 * Admin emails sourced from the ADMIN_EMAILS environment variable.
 * Comma-separated list, e.g. ADMIN_EMAILS="admin@example.com,other@example.com"
 */
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Check if the given email is in the admin allow-list.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Check if the user has an `admin` role via Stack Auth server metadata.
 * Server metadata is set by the backend and cannot be spoofed by the client.
 */
export function hasAdminRole(serverMetadata: Record<string, unknown> | null | undefined): boolean {
  if (!serverMetadata) return false;
  const role = serverMetadata.role;
  if (role === 'admin') return true;
  // Support an array of roles
  if (Array.isArray(role)) return role.includes('admin');
  const roles = serverMetadata.roles;
  if (Array.isArray(roles)) return roles.includes('admin');
  return false;
}

/**
 * Checks both the email allow-list AND that the email is verified by the auth provider.
 * Also grants access if the user has an `admin` role in their server metadata.
 * Use this instead of bare `isAdminEmail` in route guards to prevent spoofed email attacks.
 */
export function isVerifiedAdmin(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined,
  serverMetadata?: Record<string, unknown> | null
): boolean {
  // Role-based check (highest priority — not dependent on email)
  if (hasAdminRole(serverMetadata)) return true;
  // Email-based fallback
  if (!emailVerified) return false;
  return isAdminEmail(email);
}
