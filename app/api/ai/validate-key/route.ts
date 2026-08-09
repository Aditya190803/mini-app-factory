import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { isAIProviderId, type AIProviderId } from '@/lib/ai-admin-config';
import { getPersistedAISettings } from '@/lib/ai-settings-store';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Either validate a key the user just typed (`apiKey`), or validate the one already stored for
 * them (`useStored`). The stored-key path exists because the settings UI no longer receives saved
 * keys from the server — it only knows a key is present — so it cannot send one back for testing.
 */
const payloadSchema = z
  .object({
    providerId: z.string().max(40),
    apiKey: z.string().min(1).max(500).optional(),
    useStored: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.apiKey) !== Boolean(v.useStored), {
    message: 'Provide exactly one of apiKey or useStored',
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

  // Each call makes an outbound request to a third-party provider, so this needs a limit of its
  // own regardless of what the caller is validating.
  const limit = checkRateLimit({ key: `validate-key:${user.id}`, limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many key checks. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { providerId, useStored } = parsed.data;
  if (!isAIProviderId(providerId)) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }

  let apiKey = parsed.data.apiKey;
  if (useStored) {
    const persisted = await getPersistedAISettings();
    apiKey = persisted.byokConfig[providerId];
    if (!apiKey) {
      return NextResponse.json({ error: 'No saved key for this provider' }, { status: 400 });
    }
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
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
