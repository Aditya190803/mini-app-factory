/**
 * Admin access is granted by email allowlist, configured via MAF_ADMIN_EMAILS.
 *
 * Two deliberate properties:
 *
 * 1. **Fails closed.** There is no hardcoded fallback admin. If MAF_ADMIN_EMAILS is unset or
 *    empty, nobody is an admin. (This previously defaulted to a personal address committed to a
 *    public repo, which meant the allowlist was public knowledge and active by default.)
 *
 * 2. **Requires a verified email.** Matching on an unverified address would let anyone who can
 *    register with an allowlisted address take over the admin console, so `isAdminUser` checks
 *    `primaryEmailVerified` and is the only function route handlers should call.
 *
 * Longer term this should move to a Stack Auth permission/role rather than string matching —
 * see `user.hasPermission('admin')` — so that access is managed in one place.
 */

/** Parsed MAF_ADMIN_EMAILS, lowercased. Empty when unset — meaning no admins. */
export function getAdminEmails(): string[] {
  const raw = process.env.MAF_ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Raw allowlist membership check. Does NOT consider email verification — prefer `isAdminUser`.
 * Exported for tests and for the rare call site that only has an email string.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

type AdminCandidate = {
  primaryEmail?: string | null;
  primaryEmailVerified?: boolean | null;
} | null | undefined;

/** The admin gate. Requires an allowlisted AND verified primary email. */
export function isAdminUser(user: AdminCandidate): boolean {
  if (!user) return false;
  if (user.primaryEmailVerified !== true) return false;
  return isAdminEmail(user.primaryEmail);
}
