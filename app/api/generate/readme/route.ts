import { NextRequest, NextResponse } from 'next/server';
import { generateReadmeContent } from "@/lib/repo-content";

export async function POST(req: NextRequest) {
  try {
    const { projectName, prompt, files } = await req.json();

    if (!projectName || !prompt || !files) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const content = await generateReadmeContent({
      projectName,
      prompt,
      files,
    });

    return NextResponse.json({ content });
  } catch (error: unknown) {
    console.error('README generation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate README';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
