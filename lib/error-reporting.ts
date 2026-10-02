import 'server-only';

/**
 * Server-side error reporting.
 *
 * Errors used to go only to console.error, and many catch blocks swallowed them, so production
 * failures were invisible. Everything now goes through here: one structured log line (searchable
 * in the host's logs) and, when ERROR_REPORT_WEBHOOK_URL is set, a POST to that webhook. The
 * payload is `{ text }`, which Slack, Discord (via /slack) and most chat webhooks accept. Swap the
 * transport for Sentry or similar by changing `send` alone.
 */

export type ErrorContext = {
  /** Where it happened, e.g. "generate", "deploy", "request". */
  source: string;
  requestId?: string;
  path?: string;
  digest?: string;
  [key: string]: unknown;
};

const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack, name: error.name };
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

async function send(text: string) {
  const url = process.env.ERROR_REPORT_WEBHOOK_URL?.trim();
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3_500) }),
      signal: controller.signal,
    });
  } catch {
    // Reporting must never throw into the code that is already handling an error.
  } finally {
    clearTimeout(timer);
  }
}

export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  const details = describe(error);
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), ...context, ...details }));

  // The same failure repeating (a provider outage, say) should not flood the channel.
  const key = `${context.source}:${details.message}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - DEDUPE_MS) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();

  const where = [context.source, context.path, context.requestId && `request ${context.requestId}`, context.digest && `digest ${context.digest}`]
    .filter(Boolean)
    .join(' · ');
  await send(`Mini App Factory error (${where}): ${details.message}`);
}
