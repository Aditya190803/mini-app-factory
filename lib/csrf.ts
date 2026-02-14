import { NextRequest } from 'next/server';

/**
 * Validate the request origin to prevent CSRF attacks on state-mutating endpoints.
 * Compares the Origin (or Referer) header against the Host header.
 * Returns true if the request is from the same origin, false otherwise.
 */
export function validateOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return false;

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const url = new URL(origin);
      return url.host === host;
    } catch {
      return false;
    }
  }

  // Fallback to Referer header for same-origin requests without Origin
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return url.host === host;
    } catch {
      return false;
    }
  }

  // No Origin or Referer — reject in production, allow in dev for tools like curl
  return process.env.NODE_ENV === 'development';
}
