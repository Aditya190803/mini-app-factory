import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateReadmeContent } from "@/lib/repo-content";
import { stackServerApp } from '@/stack/server';
import { assertCanAccessProject } from '@/lib/project-access';
import { getProject, getFiles } from '@/lib/projects';

const readmeSchema = z.object({
  projectName: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid project name'),
  prompt: z.string().trim().min(1).max(8_000).optional(),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const user = await stackServerApp.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = readmeSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { projectName, prompt } = parsed.data;

    const projectRecord = await getProject(projectName);
    const access = assertCanAccessProject(projectRecord, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status });
    }
    const project = access.project;

    const storedFiles = await getFiles(projectName);
    if (storedFiles.length === 0) {
      return NextResponse.json({ error: 'No project files found' }, { status: 400 });
    }

    const effectivePrompt = (prompt || project.prompt || '').trim();
    if (!effectivePrompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const content = await generateReadmeContent({
      projectName,
      prompt: effectivePrompt,
      files: storedFiles.map((file) => file.path),
    });

    return NextResponse.json({ content });
  } catch (error: unknown) {
    console.error('README generation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate README';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
