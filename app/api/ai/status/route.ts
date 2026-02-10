export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const googleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const groqKey = !!process.env.GROQ_API_KEY;

    if (!googleKey && !groqKey) {
      return Response.json({ status: 'unavailable', error: 'Neither GOOGLE_GENERATIVE_AI_API_KEY nor GROQ_API_KEY is set. Please configure at least one AI provider.' }, { status: 503 });
    }

    // Probe Google Gemini connectivity
    if (googleKey) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { 'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY! },
          signal: controller.signal,
        });
        clearTimeout(id);

        if (resp.ok) {
          return Response.json({ status: 'ok', message: `Google Gemini reachable (HTTP ${resp.status})`, details: { googleKey, groqKey } });
        }
      } catch {
        clearTimeout(id);
        // If Google Gemini fails, try Groq
      }
    }

    // Probe Groq connectivity as fallback check
    if (groqKey) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          signal: controller.signal,
        });
        clearTimeout(id);

        if (resp.ok) {
          return Response.json({ status: 'ok', message: `Groq reachable (HTTP ${resp.status})`, details: { googleKey, groqKey } });
        }
      } catch {
        clearTimeout(id);
      }
    }

    return Response.json({ status: 'unavailable', error: 'All AI providers unreachable.', details: { googleKey, groqKey } }, { status: 503 });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return Response.json({ status: 'unavailable', error }, { status: 503 });
  }
}
