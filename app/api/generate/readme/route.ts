import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { buildReadmePrompt } from '@/lib/site-builder';
import { createCerebras } from '@ai-sdk/cerebras';
import { createGroq } from '@ai-sdk/groq';

export async function POST(req: NextRequest) {
  try {
    const { projectName, prompt, files } = await req.json();

    if (!projectName || !prompt || !files) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const readmePrompt = buildReadmePrompt(projectName, prompt, files);

    let content = '';
    
    // Use Cerebras as the fast fallback model for non-critical content like README
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (cerebrasKey) {
      const cerebras = createCerebras({ apiKey: cerebrasKey });
      const { text } = await generateText({
        model: cerebras(process.env.CEREBRAS_MODEL || 'llama-3.3-70b'),
        prompt: readmePrompt,
      });
      content = text;
    } else if (groqKey) {
      const groq = createGroq({ apiKey: groqKey });
      const { text } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        prompt: readmePrompt,
      });
      content = text;
    } else {
      // Very basic fallback if no API keys
      content = `# ${projectName}\n\n${prompt}\n\n---\nMade by [Mini App Factory](https://github.com/Aditya190803/mini-app-factory)`;
    }

    return NextResponse.json({ content });
  } catch (error: unknown) {
    console.error('README generation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate README';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
