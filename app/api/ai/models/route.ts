import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type ProviderConfig = {
  id: 'google' | 'groq';
  name: string;
  envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' | 'GROQ_API_KEY';
  url: string;
};

type ProviderModel = {
  id: string;
};

type GroqProviderResponse = {
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
      id: 'google',
      name: 'Google Gemini',
      envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
      url: 'https://generativelanguage.googleapis.com/v1beta/models'
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
        headers: provider.id === 'google' 
          ? { 'x-goog-api-key': apiKey } 
          : { 'Authorization': `Bearer ${apiKey}` },
        next: { revalidate: 3600 } // Cache for 1 hour
      });
      
      if (resp.ok) {
        const json = await resp.json();
        let providerModels: ModelEntry[];

        if (provider.id === 'google') {
          // Hardcoded list as requested by user
          const googleModels = [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemma-3-27b', name: 'Gemma 3 27B' },
          ];

          providerModels = googleModels.map((m) => {
            const isVision = m.id.toLowerCase().includes('gemini');
            return {
              id: m.id,
              name: m.name,
              fullName: `${m.name} (${provider.name})`,
              provider: provider.name,
              providerId: provider.id,
              hasVision: isVision
            };
          });
        } else {
          const data = json as GroqProviderResponse;
          providerModels = (data.data || []).map((m) => {
            const isVision = m.id.toLowerCase().includes('vision');
            return {
              id: m.id,
              name: m.id,
              fullName: `${m.id} (${provider.name})`,
              provider: provider.name,
              providerId: provider.id,
              hasVision: isVision
            };
          });
        }

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
