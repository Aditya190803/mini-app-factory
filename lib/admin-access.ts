export const ADMIN_EMAIL = 'aditya.mer@somaiya.edu';

export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}
