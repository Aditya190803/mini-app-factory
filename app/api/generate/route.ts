import { z } from 'zod';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_COPILOT_API = 'https://api.github.com/copilot_internal/v2/completions';

const designSpecSchema = z.object({
  design_spec: z.string(),
});

const websiteSchema = z.object({
  html: z.string().describe('Complete, production-ready HTML with embedded Tailwind CSS. Must include proper semantic HTML structure, responsive design, and modern styling.'),
});

async function callGitHubCopilot(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }

  const response = await fetch(GITHUB_COPILOT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mini-App-Factory',
      'X-GitHub-Media-Type': 'github.v3',
    },
    body: JSON.stringify({
      messages,
      model: 'gpt-4-mini',
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Copilot API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

async function conceptualizeWebsite(prompt: string): Promise<string> {
  const systemMessage = `You are an expert web design architect. Given a user's request, create a detailed design specification that includes:
- Layout structure (header, hero, sections, footer)
- Typography hierarchy
- Color scheme
- Key UI components and their interactions
- Responsive breakpoints
- Content organization
- Special effects or animations needed

Be specific and detailed so that an HTML generation AI can create an accurate implementation.`;

  const response = await callGitHubCopilot([
    { role: 'system', content: systemMessage },
    { role: 'user', content: prompt },
  ]);

  return response;
}

async function generateHTML(prompt: string, designSpec: string): Promise<string> {
  const systemMessage = `You are an expert HTML/CSS/JavaScript developer. Generate a complete, production-ready HTML file that:
1. Uses Tailwind CSS v4 (via CDN: https://cdn.tailwindcss.com)
2. Is fully responsive (mobile-first design)
3. Includes semantic HTML elements
4. Has proper accessibility attributes
5. Uses modern CSS patterns and animations
6. Is self-contained (no external dependencies except Tailwind)
7. Uses generic placeholder images where needed
8. Includes basic interactivity with vanilla JavaScript where appropriate

Return ONLY the HTML code, nothing else. The HTML should be complete and ready to save as an .html file.`;

  const userPrompt = `Design Specification:\n${designSpec}\n\nOriginal Request:\n${prompt}`;

  const response = await callGitHubCopilot([
    { role: 'system', content: systemMessage },
    { role: 'user', content: userPrompt },
  ]);

  return response;
}

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt || prompt.trim().length === 0) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!GITHUB_TOKEN) {
      return Response.json(
        { error: 'GITHUB_TOKEN environment variable is not set. Please add your GitHub Personal Access Token in the Vars section.' },
        { status: 500 }
      );
    }

    console.log('[v0] Generating website for prompt:', prompt);

    // Pass 1: Conceptualize
    console.log('[v0] Starting conceptualization phase...');
    const designSpec = await conceptualizeWebsite(prompt);
    console.log('[v0] Design specification created');

    // Pass 2: Generate
    console.log('[v0] Starting HTML generation phase...');
    const html = await generateHTML(prompt, designSpec);
    console.log('[v0] HTML generation complete');

    return Response.json({ html });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate website';
    console.error('[v0] Generation error:', error);
    return Response.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
