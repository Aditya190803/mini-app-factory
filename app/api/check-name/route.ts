import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { projectExists, saveProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { validateOrigin } from '@/lib/csrf';

const checkNameSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120),
  prompt: z.string().trim().max(8_000).optional(),
  selectedModel: z.string().trim().max(120).optional(),
  providerId: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const parseResult = checkNameSchema.safeParse(await req.json());
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    );
  }
  const { name, prompt, selectedModel, providerId } = parseResult.data;

  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const normalizedName = name.trim().toLowerCase();
  
  // Validation for project name (alphanumeric and dashes)
  if (!/^[a-z0-9-]+$/.test(normalizedName)) {
    return NextResponse.json({ error: 'Project name can only contain letters, numbers, and dashes' }, { status: 400 });
  }

  if (await projectExists(normalizedName)) {
    return NextResponse.json({ error: 'Project name is already taken' }, { status: 409 });
  }

  // "Reserve" the name by creating a pending project
  if (prompt) {
    await saveProject({
      name: normalizedName,
      prompt,
      createdAt: Date.now(),
      status: 'pending',
      userId: user.id,
      selectedModel,
      providerId,
    });
  }

  return NextResponse.json({ success: true, name: normalizedName });
}
