/** Stored on project.description when user sets a reference URL at project creation. */
export function isHttpUrl(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  try {
    const u = new URL(value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeReferenceUrl(raw: string): string {
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}