import { NextRequest, NextResponse } from 'next/server';
import { projectExists, saveProject } from '@/lib/projects';
import { stackServerApp } from '@/stack/server';
import { isHttpUrl, normalizeReferenceUrl } from '@/lib/url-reference';

export async function POST(req: NextRequest) {
  const { name, prompt, selectedModel, providerId, referenceUrl } = await req.json();

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
    const ref = typeof referenceUrl === 'string' && referenceUrl.trim() ? referenceUrl.trim() : undefined;
    const storedRef = ref && isHttpUrl(ref) ? normalizeReferenceUrl(ref) : undefined;
    await saveProject({
      name: normalizedName,
      prompt,
      createdAt: Date.now(),
      status: 'pending',
      userId: user.id,
      selectedModel,
      providerId,
      referenceUrl: storedRef,
    });
  }

  return NextResponse.json({ success: true, name: normalizedName });
}
