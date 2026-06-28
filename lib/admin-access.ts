const DEFAULT_ADMIN_EMAIL = 'aditya.mer@somaiya.edu';

/** Comma-separated override via MAF_ADMIN_EMAILS (lowercase compare). */
export function getAdminEmails(): string[] {
  const raw = process.env.MAF_ADMIN_EMAILS?.trim();
  if (!raw) return [DEFAULT_ADMIN_EMAIL];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return getAdminEmails().includes(normalized);
}
