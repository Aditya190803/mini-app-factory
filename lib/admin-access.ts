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
 * Checks both the email allow-list AND that the email is verified by the auth provider.
 * Use this instead of bare `isAdminEmail` in route guards to prevent spoofed email attacks.
 */
export function isVerifiedAdmin(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined
): boolean {
  if (!emailVerified) return false;
  return isAdminEmail(email);
}
