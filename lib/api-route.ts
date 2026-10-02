import 'server-only';

import { CloudflareApiError } from '@/lib/cloudflare';
import { GitHubApiError } from '@/lib/github';
import { NetlifyApiError } from '@/lib/netlify';
import { reportError } from '@/lib/error-reporting';

/**
 * The error shape every API route returns: `{ error, code, requestId? }`. lib/api-fetch.ts reads
 * it on the client. Routes used to answer in several shapes, and mapped every upstream failure to
 * 400 — so a Cloudflare outage looked like the user's own bad input.
 */
export function apiError(status: number, error: string, code: string, extra?: Record<string, unknown>) {
  return Response.json({ error, code, ...extra }, { status });
}

/** Map an upstream provider failure to a status that says whose fault it was. */
export function upstreamErrorResponse(error: unknown, fallback: string) {
  const status = error instanceof CloudflareApiError || error instanceof GitHubApiError || error instanceof NetlifyApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : fallback;
  if (status === 401 || status === 403) {
    return apiError(403, message, 'UPSTREAM_FORBIDDEN', { hint: 'Reconnect the account in Settings; its access may have expired or lack a permission.' });
  }
  if (status === 404) return apiError(404, message, 'UPSTREAM_NOT_FOUND');
  if (status === 409) return apiError(409, message, 'UPSTREAM_CONFLICT');
  if (status === 429) return apiError(429, message, 'UPSTREAM_RATE_LIMITED');
  if (status !== undefined && status >= 500) return apiError(502, message, 'UPSTREAM_UNAVAILABLE');
  if (status !== undefined && status >= 400) return apiError(400, message, 'UPSTREAM_REJECTED');
  return apiError(500, fallback, 'INTERNAL_ERROR');
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/**
 * Wrap a route handler: anything it throws is reported and answered in the standard shape, with
 * a request id the user can quote. Upstream API errors keep their meaning (see above).
 */
export function withRoute<C = unknown>(source: string, handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof CloudflareApiError || error instanceof GitHubApiError || error instanceof NetlifyApiError) {
        return upstreamErrorResponse(error, 'The request to the provider failed');
      }
      const requestId = crypto.randomUUID();
      await reportError(error, { source: `route:${source}`, requestId, path: new URL(request.url).pathname });
      return apiError(500, 'Something went wrong on our side. Try again.', 'INTERNAL_ERROR', { requestId });
    }
  };
}
