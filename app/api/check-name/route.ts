import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectExists, reserveProjectName } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { isHttpUrl, normalizeReferenceUrl } from '@/lib/url-reference';
import { checkRateLimit } from '@/lib/rate-limit';

const checkNameSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    prompt: z.string().trim().max(20_000).optional(),
    selectedModel: z.string().max(200).optional(),
    providerId: z.string().max(60).optional(),
    referenceUrl: z.string().max(2_000).optional(),
    target: z.enum(['static', 'edge']).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // This creates a database row per call, so it needs a limit of its own.
  const limit = checkRateLimit({ key: `check-name:${user.id}`, limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many projects created. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = checkNameSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { name, prompt, selectedModel, providerId, referenceUrl, target } = parsed.data;

  const normalizedName = name.trim().toLowerCase();

  // Validation for project name (alphanumeric and dashes)
  if (!/^[a-z0-9-]+$/.test(normalizedName)) {
    return NextResponse.json({ error: 'Project name can only contain letters, numbers, and dashes' }, { status: 400 });
  }

  if (!prompt) {
    // Availability check only — no row created.
    if (await projectExists(normalizedName)) {
      return NextResponse.json({ error: 'Project name is already taken' }, { status: 409 });
    }
    return NextResponse.json({ success: true, name: normalizedName });
  }

  const ref = referenceUrl?.trim() || undefined;
  const storedRef = ref && isHttpUrl(ref) ? normalizeReferenceUrl(ref) : undefined;

  // Single mutation: checks availability and inserts together, so two concurrent requests for the
  // same name cannot both succeed the way a separate check-then-insert allowed.
  const reserved = await reserveProjectName({
    projectName: normalizedName,
    prompt,
    selectedModel,
    providerId,
    referenceUrl: storedRef,
    target,
  });

  if (!reserved) {
    return NextResponse.json({ error: 'Project name is already taken' }, { status: 409 });
  }

  return NextResponse.json({ success: true, name: normalizedName });
}
