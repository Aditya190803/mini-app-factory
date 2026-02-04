import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ProviderConfig = {
  id: 'cerebras' | 'groq';
  name: string;
  envKey: 'CEREBRAS_API_KEY' | 'GROQ_API_KEY';
  url: string;
};

type ProviderModel = {
  id: string;
};

type ProviderResponse = {
  data: ProviderModel[];
};

type ModelEntry = {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  providerId: string;
  hasVision?: boolean;
};

export async function GET() {
  const models: ModelEntry[] = [];
  
  const providers: ProviderConfig[] = [
    {
      id: 'cerebras',
      name: 'Cerebras',
      envKey: 'CEREBRAS_API_KEY',
      url: 'https://api.cerebras.ai/v1/models'
    },
    {
      id: 'groq',
      name: 'Groq',
      envKey: 'GROQ_API_KEY',
      url: 'https://api.groq.com/openai/v1/models'
    }
  ];

  await Promise.all(providers.map(async (provider) => {
    const apiKey = process.env[provider.envKey];
    if (!apiKey) return;

    try {
      const resp = await fetch(provider.url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        next: { revalidate: 3600 } // Cache for 1 hour
      });
      
      if (resp.ok) {
        const data = (await resp.json()) as ProviderResponse;
        const providerModels = data.data.map((m) => {
          const isVision = m.id.toLowerCase().includes('vision');
          return {
            id: m.id,
            name: `${m.id}`,
            fullName: `${m.id} (${provider.name})`,
            provider: provider.name,
            providerId: provider.id,
            hasVision: isVision
          };
        });
        models.push(...providerModels);
      } else {
        console.error(`Status ${resp.status} from ${provider.name}:`, await resp.text().catch(() => 'No body'));
      }
    } catch (error) {
      console.error(`Failed to fetch models from ${provider.name}:`, error);
    }
  }));

  // Sort models by name
  models.sort((a, b) => a.fullName.localeCompare(b.fullName));

  return NextResponse.json({ models }, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
