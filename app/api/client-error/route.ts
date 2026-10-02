import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { reportError } from '@/lib/error-reporting';

const schema = z.object({
  message: z.string().max(1_000),
  digest: z.string().max(100).optional(),
  path: z.string().max(500).optional(),
  boundary: z.enum(['page', 'global']),
}).strict();

/**
 * Errors caught by the React error boundaries in the browser. Only signed-in reports reach the
 * webhook; anonymous ones are logged, so the endpoint cannot be used to spam the alert channel.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 4_000) return new Response(null, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });

  const user = await stackServerApp.getUser().catch(() => null);
  const context = { source: `client:${parsed.data.boundary}`, path: parsed.data.path, digest: parsed.data.digest };
  if (user) await reportError(parsed.data.message, { ...context, userId: user.id });
  else console.error(JSON.stringify({ level: 'error', ...context, message: parsed.data.message }));
  return new Response(null, { status: 204 });
}
