export const dynamic = 'force-dynamic';

const providers = [
  {
    name: 'OpenCode Zen',
    key: () => process.env.OPENCODE_API_KEY,
    url: 'https://opencode.ai/zen/v1/models',
  },
  {
    name: 'OpenRouter',
    key: () => process.env.OPENROUTER_API_KEY,
    url: 'https://openrouter.ai/api/v1/models',
  },
];

export async function GET() {
  try {
    const configured = providers.filter((provider) => provider.key());
    const details = {
      opencodeKey: !!process.env.OPENCODE_API_KEY,
      openrouterKey: !!process.env.OPENROUTER_API_KEY,
    };

    if (configured.length === 0) {
      return Response.json(
        { status: 'unavailable', error: 'No AI provider key is set. Configure OpenCode or OpenRouter.' },
        { status: 503 },
      );
    }

    for (const provider of configured) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(provider.url, {
          headers: { Authorization: `Bearer ${provider.key()}` },
          signal: controller.signal,
        });
        if (response.ok) {
          return Response.json({
            status: 'ok',
            message: `${provider.name} reachable (HTTP ${response.status})`,
            details,
          });
        }
      } catch {
        // Try the next configured provider.
      } finally {
        clearTimeout(timer);
      }
    }

    return Response.json(
      { status: 'unavailable', error: 'All AI providers are unreachable.', details },
      { status: 503 },
    );
  } catch (error) {
    return Response.json(
      { status: 'unavailable', error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
