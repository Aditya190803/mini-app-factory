export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKeyPresent = !!process.env.CEREBRAS_API_KEY;
    const apiUrl = process.env.CEREBRAS_API_URL || 'https://api.cerebras.ai/v1/chat/completions';

    // Quick misconfiguration check
    if (/status\.cerebras/i.test(apiUrl)) {
      return Response.json({ status: 'unavailable', error: 'CEREBRAS_API_URL points to a status page. Set it to https://api.cerebras.ai/v1/chat/completions or remove it to use the default.' }, { status: 503 });
    }

    // Probe network connectivity with a short POST
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'ping', messages: [] }),
        signal: controller.signal,
      });
      clearTimeout(id);

      const httpStatus = resp.status;

      if (!apiKeyPresent) {
        return Response.json({ status: 'unavailable', error: 'CEREBRAS_API_KEY is not set. Please set it in your environment and restart the dev server.', details: { apiKeyPresent, apiUrl, httpStatus } }, { status: 503 });
      }

      // If API key is present and host reachable, report 'ok'
      return Response.json({ status: 'ok', message: `Cerebras reachable (HTTP ${httpStatus})`, details: { apiKeyPresent, apiUrl, httpStatus } });
    } catch (e) {
      clearTimeout(id);
      const m = e instanceof Error ? e.message : String(e);
      return Response.json({ status: 'unavailable', error: 'Network error contacting Cerebras. Ensure CEREBRAS_API_KEY is set and the server can reach https://api.cerebras.ai', diagnostic: m, details: { apiKeyPresent, apiUrl } }, { status: 503 });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return Response.json({ status: 'unavailable', error }, { status: 503 });
  }
}
