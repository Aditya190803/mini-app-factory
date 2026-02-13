import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { isAIProviderId, type AIProviderId } from '@/lib/ai-admin-config';

const payloadSchema = z.object({
  providerId: z.string(),
  apiKey: z.string().min(1),
});

type ProviderProbe = {
  url: string;
  buildHeaders: (apiKey: string) => Record<string, string>;
};

const providerProbe: Record<AIProviderId, ProviderProbe> = {
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    buildHeaders: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/models',
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
};

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { providerId, apiKey } = parsed.data;
  if (!isAIProviderId(providerId)) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }

  const probe = providerProbe[providerId];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const resp = await fetch(probe.url, {
      headers: probe.buildHeaders(apiKey),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Provider rejected key (HTTP ${resp.status})` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Key is valid and provider is reachable.' });
  } catch {
    return NextResponse.json({ error: 'Unable to reach provider. Try again.' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
