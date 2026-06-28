import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { getServerEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchExaUrlContext } from '@/lib/exa-url-context';
import { normalizeReferenceUrl } from '@/lib/url-reference';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    url: z.string().trim().min(4).max(2048),
  })
  .strict();

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    getServerEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid environment';
    return Response.json({ error: message, code: 'ENV_INVALID', requestId }, { status: 500 });
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'EXA_API_KEY is not configured', code: 'EXA_NOT_CONFIGURED', requestId },
      { status: 503 }
    );
  }

  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON', code: 'INVALID_JSON', requestId }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload', code: 'INVALID_PAYLOAD', requestId }, { status: 400 });
  }

  const rateLimit = checkRateLimit({ key: `${user.id}:url-context`, limit: 15, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMITED', retryAfter, requestId },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const url = normalizeReferenceUrl(parsed.data.url);
    const context = await fetchExaUrlContext(url, apiKey);
    return Response.json({ success: true, context, requestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch URL context';
    return Response.json({ error: message, code: 'EXA_FETCH_FAILED', requestId }, { status: 502 });
  }
}