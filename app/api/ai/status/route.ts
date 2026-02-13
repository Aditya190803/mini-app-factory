export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const googleKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const groqKey = !!process.env.GROQ_API_KEY;
    const openrouterKey = !!process.env.OPENROUTER_API_KEY;
    const cerebrasKey = !!process.env.CEREBRAS_API_KEY;

    if (!googleKey && !groqKey && !openrouterKey && !cerebrasKey) {
      return Response.json({ status: 'unavailable', error: 'No AI provider key is set (Google, Groq, OpenRouter, Cerebras). Please configure at least one provider.' }, { status: 503 });
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
          return Response.json({ status: 'ok', message: `Google Gemini reachable (HTTP ${resp.status})`, details: { googleKey, groqKey, openrouterKey, cerebrasKey } });
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
          return Response.json({ status: 'ok', message: `Groq reachable (HTTP ${resp.status})`, details: { googleKey, groqKey, openrouterKey, cerebrasKey } });
        }
      } catch {
        clearTimeout(id);
      }
    }

    if (openrouterKey) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
          signal: controller.signal,
        });
        clearTimeout(id);

        if (resp.ok) {
          return Response.json({ status: 'ok', message: `OpenRouter reachable (HTTP ${resp.status})`, details: { googleKey, groqKey, openrouterKey, cerebrasKey } });
        }
      } catch {
        clearTimeout(id);
      }
    }

    if (cerebrasKey) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      try {
        const resp = await fetch('https://api.cerebras.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}` },
          signal: controller.signal,
        });
        clearTimeout(id);

        if (resp.ok) {
          return Response.json({ status: 'ok', message: `Cerebras reachable (HTTP ${resp.status})`, details: { googleKey, groqKey, openrouterKey, cerebrasKey } });
        }
      } catch {
        clearTimeout(id);
      }
    }

    return Response.json({ status: 'unavailable', error: 'All AI providers unreachable.', details: { googleKey, groqKey, openrouterKey, cerebrasKey } }, { status: 503 });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return Response.json({ status: 'unavailable', error }, { status: 503 });
  }
}
