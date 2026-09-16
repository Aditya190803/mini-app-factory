export const dynamic = 'force-dynamic';

const providers = [
  {
    name: 'AI Gateway',
    key: () => process.env.AI_GATEWAY_API_KEY,
    url: `${(process.env.AI_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '')}/models`,
  },
  {
    name: 'OpenCode Zen',
    key: () => process.env.OPENCODE_API_KEY,
    url: 'https://opencode.ai/zen/v1/models',
  },
];

export async function GET() {
  try {
    const configured = providers.filter((provider) => provider.key() && provider.url && !provider.url.startsWith('/'));
    const details = {
      gatewayKey: !!process.env.AI_GATEWAY_API_KEY,
      opencodeKey: !!process.env.OPENCODE_API_KEY,
    };

    if (configured.length === 0) {
      return Response.json(
        { status: 'unavailable', error: 'No AI provider key is set. Configure AI Gateway or OpenCode.' },
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
