import { z } from 'zod';
import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';
import { getAIClient } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { executeTool } from '@/lib/tool-executor';
import { ProjectFile } from '@/lib/page-builder';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Health check so clients can verify the endpoint is available without invoking the AI backend
export async function GET() {
  return Response.json({ ok: true });
}

export async function sendAIMessage(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = await getAIClient();
  const session = await client.createSession({
    systemMessage: { content: systemPrompt },
  });

  try {
    const response = await session.sendAndWait({ prompt: userPrompt }, 120000);
    return response?.data?.content || '';
  } finally {
    await session.destroy().catch(() => { });
  }
}

const transformSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    language: z.string(),
    fileType: z.string(),
  })).optional(),
  html: z.string().optional(), // Legacy support
  prompt: z.string().optional(),
  activeFile: z.string().optional(),
  polishDescription: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = transformSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { files, html, prompt, activeFile, polishDescription } = parsed.data;

    // Detect if there's a target element instruction to adjust focus
    let targetFile = activeFile;
    if (prompt && prompt.includes('Target element in ')) {
      const match = prompt.match(/Target element in ([a-zA-Z0-9._-]+):/);
      if (match) targetFile = match[1];
    }

    let projectContext = '';
    if (files && files.length > 0) {
      projectContext = files.map(f => `File: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
    } else if (html) {
      projectContext = `File: index.html\n\`\`\`html\n${html}\n\`\`\``;
    }

    const client = await getAIClient();
    const systemMessage = `You are an expert web developer specializing in precise, tool-based site modifications. 
You will be given the complete project context comprising all files.

Your modifications MUST maintain consistency across the entire project. For example, if you change a class name in styles.css, you must update it in all relevant HTML files.

**Target Element Context**:
- If the user prompt mentions a "Target element", prioritize modifications to that specific piece of code.
- Ensure any changes to the target element are reflected correctly using the tools provided.
- If you use a selector, make it as specific as possible (e.g. use classes, IDs, or :contains() logic) to ensure only the intended element is changed.

**Shared Partials (CRITICAL)**:
- If a project has multiple pages, you MUST ensure there is a \`header.html\` (and \`footer.html\` if applicable).
- DO NOT allow duplicate header/footer code in individual pages. 
- If you see duplication, use the \`createFile\` tool to make a partial and replace the duplicate code in all pages with \`<!-- include:header.html -->\`.
- Any shared navigation or branding MUST live in a partial.

You MUST use structured tool calls to modify files. 
Available tools:
1. replaceContent(file, selector, oldContent, newContent) - Use for precise HTML changes. newContent is the INNER html.
2. replaceElement(file, selector, newContent) - Replace the matching element ENTIRELY with newContent.
3. insertContent(file, position, selector, content) - position: before, after, prepend, append.
4. deleteContent(file, selector) - Remove an element.
5. createFile(path, content, fileType) - Create a new page, style, script or partial.
6. deleteFile(path) - Remove a file.
7. updateStyle(selector, properties, action) - For precise CSS rule changes. Action: "replace" (default) or "merge".

FORMAT: Return your changes ONLY as a JSON array of tool calls:
[
  { "tool": "replaceContent", "args": { "file": "index.html", "selector": "h1", "newContent": "Hello World" } },
  ...
]

If a change is too complex for tools, or you need to rewrite a file completely, use:
{ "tool": "updateFile", "args": { "file": "path/to/file", "content": "FULL_CONTENT" } }

Note:
- You have access to ALL project files. 
- Ensure links (<a> tags) and asset references remain valid.
- Active file focus is: ${targetFile || 'index.html'}.

Only return changes. No explanations.`;

    let userMessage: string;
    if (polishDescription && !prompt) {
      const polishPrompt = buildPolishPrompt(polishDescription);
      userMessage = `${polishPrompt}\n\nProject Context:\n\n${projectContext}`;
    } else {
      userMessage = `Project Context:\n\n${projectContext}\n\nModification Request:\n\n${prompt || ''}`;
    }

    const session = await client.createSession({
      model: process.env.CEREBRAS_MODEL || 'zai-glm-4.7',
      systemMessage: { content: systemMessage },
    });

    // Since we need to parse the multi-file output, we can't easily stream it back as raw text
    // if we want to return a structured JSON response. 
    // However, the EditorWorkspace expects a JSON response now.
    
    const response = await session.sendAndWait({ prompt: userMessage }, 150000);
    const content = response?.data?.content || '';
    
    let finalFiles = files ? [...files] : (html ? [{ path: 'index.html', content: html, language: 'html', fileType: 'page' } as ProjectFile] : []);

    try {
      // Try to parse as JSON tool calls. 
      // Be robust: extracted content might have leading/trailing text or be inside a code block
      let jsonContent = content;
      const jsonMatch = content.match(/\[\s*\{\s*"tool":[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      } else {
        jsonContent = stripCodeFence(content);
      }

      const toolCalls = JSON.parse(jsonContent);
      if (Array.isArray(toolCalls)) {
        for (const call of toolCalls) {
          if (call.tool === 'updateFile') {
            const idx = finalFiles.findIndex(f => f.path === call.args.file);
            if (idx >= 0) {
              finalFiles[idx] = {
                ...finalFiles[idx],
                content: call.args.content
              };
            } else {
              finalFiles.push({
                path: call.args.file,
                content: call.args.content,
                language: call.args.file.endsWith('.css') ? 'css' : call.args.file.endsWith('.js') ? 'javascript' : 'html',
                fileType: call.args.file.endsWith('.css') ? 'style' : call.args.file.endsWith('.js') ? 'script' : 'page',
              });
            }
          } else {
            const result = await executeTool(call.tool, call.args, finalFiles as ProjectFile[]);
            if (result.success && result.updatedFiles) {
              result.updatedFiles.forEach(uf => {
                const idx = finalFiles.findIndex(f => f.path === uf.path);
                if (idx >= 0) finalFiles[idx] = uf;
                else finalFiles.push(uf);
              });
            }
            if (result.success && result.deletedPaths) {
              finalFiles = finalFiles.filter(f => !result.deletedPaths?.includes(f.path));
            }
          }
        }
      } else {
        throw new Error('Not an array of tool calls');
      }
    } catch (err) {
      // Fallback to block parsing
      const updatedFiles = parseMultiFileOutput(content);
      if (updatedFiles.length > 0) {
        updatedFiles.forEach(uf => {
          const idx = finalFiles.findIndex(f => f.path === uf.path);
          if (idx >= 0) {
            finalFiles[idx] = uf;
          } else {
            finalFiles.push(uf);
          }
        });
      } else if (content && content.length > 50 && (content.includes('<html>') || content.includes('<div') || content.includes('function') || content.includes('const '))) {
        // Only overwrite if it really looks like code content
        const activePath = activeFile || 'index.html';
        const idx = finalFiles.findIndex(f => f.path === activePath);
        if (idx >= 0) {
          finalFiles[idx].content = stripCodeFence(content);
        }
      }
    }

    await session.destroy().catch(() => { });

    return Response.json({ files: finalFiles });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to transform site';
    console.error('Transform error:', error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
