import { z } from 'zod';
import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';
import { getAIClient } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { executeTool } from '@/lib/tool-executor';
import { ProjectFile, validateFileStructure } from '@/lib/page-builder';
import { stackServerApp } from '@/stack/server';
import { getProject, getFiles, saveFiles } from '@/lib/projects';
import { getServerEnv } from '@/lib/env';
import { checkRateLimit } from '@/lib/rate-limit';
import { withRetry } from '@/lib/ai-retry';

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
  projectName: z.string().optional(),
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
  modelId: z.string().optional(),
  providerId: z.string().optional(),
}).refine((data) => data.projectName || data.html, {
  message: 'projectName or html is required',
});

const MAX_CONTEXT_CHARS = 120_000;

const fileTypeFromPath = (path: string): ProjectFile['fileType'] => {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.css')) return 'style';
  if (lowerPath.endsWith('.js')) return 'script';
  return 'page';
};

const normalizeFileType = (raw: unknown, path: string): ProjectFile['fileType'] => {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'html') return 'page';
  if (value === 'css') return 'style';
  if (value === 'js' || value === 'javascript') return 'script';
  if (value === 'page' || value === 'partial' || value === 'style' || value === 'script') {
    return value as ProjectFile['fileType'];
  }
  if (path) return fileTypeFromPath(path);
  return 'page';
};

function buildProjectContext(files: ProjectFile[], activeFile?: string) {
  const prioritized = [...files].sort((a, b) => {
    if (activeFile && a.path === activeFile) return -1;
    if (activeFile && b.path === activeFile) return 1;
    if (a.fileType === 'partial' && b.fileType !== 'partial') return -1;
    if (b.fileType === 'partial' && a.fileType !== 'partial') return 1;
    return a.path.localeCompare(b.path);
  });

  const included: string[] = [];
  const omitted: string[] = [];
  let total = 0;

  for (const file of prioritized) {
    const block = `File: ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
    if (total + block.length > MAX_CONTEXT_CHARS) {
      omitted.push(file.path);
      continue;
    }
    included.push(block);
    total += block.length;
  }

  const header = `Project Files: ${files.map((f) => f.path).join(', ')}`;
  const omittedNote = omitted.length > 0
    ? `\n\n[Context Budget] Omitted files: ${omitted.join(', ')}`
    : '';

  return `${header}\n\n${included.join('\n\n')}${omittedNote}`.trim();
}

function classifyTransformError(raw: unknown) {
  const message = raw instanceof Error ? raw.message : String(raw ?? 'Transform failed');
  const lowered = message.toLowerCase();
  if (lowered.includes('invalid payload')) return { code: 'INVALID_PAYLOAD', message };
  if (lowered.includes('rate limit')) return { code: 'RATE_LIMITED', message };
  if (lowered.includes('unauthorized') || lowered.includes('authentication')) return { code: 'UNAUTHORIZED', message };
  if (
    lowered.includes('tool not allowed') ||
    lowered.includes('invalid selector') ||
    lowered.includes('invalid file path') ||
    lowered.includes('not an array of tool calls') ||
    lowered.includes('unexpected token')
  ) {
    return { code: 'INVALID_TOOL_CALL', message };
  }
  return { code: 'TRANSFORM_ERROR', message };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    try {
      getServerEnv();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid environment configuration';
      return Response.json({ error: message, code: 'ENV_INVALID', requestId }, { status: 500 });
    }

    const user = await stackServerApp.getUser();
    if (!user) {
      return Response.json({ error: 'Authentication required', code: 'UNAUTHORIZED', requestId }, { status: 401 });
    }

    const body = await request.json();
    const parsed = transformSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload', code: 'INVALID_PAYLOAD', requestId }, { status: 400 });
    }

    const rateLimit = checkRateLimit({ key: `${user.id}:transform`, limit: 20, windowMs: 60_000 });
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return Response.json(
        { error: 'Rate limit exceeded. Please wait before retrying.', code: 'RATE_LIMITED', retryAfter, requestId },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const { 
      projectName, html, prompt, activeFile, polishDescription, 
      modelId, providerId
    } = parsed.data;

    const project = projectName ? await getProject(projectName) : null;
    if (projectName && !project) {
      return Response.json({ error: 'Project not found', code: 'PROJECT_NOT_FOUND', requestId }, { status: 404 });
    }
    if (project && project.userId && project.userId !== user.id) {
      return Response.json({ error: 'Unauthorized to edit this project', code: 'FORBIDDEN', requestId }, { status: 403 });
    }

    // Detect if there's a target element instruction to adjust focus
    let targetFile = activeFile;
    if (prompt && prompt.includes('Target element in ')) {
      const match = prompt.match(/Target element in ([a-zA-Z0-9._-]+):/);
      if (match) targetFile = match[1];
    }

    let finalFiles: ProjectFile[] = [];
    if (projectName) {
      const storedFiles = await getFiles(projectName);
      finalFiles = storedFiles.map((file) => ({
        path: file.path,
        content: file.content,
        language: file.language,
        fileType: normalizeFileType(file.fileType, file.path),
      }));
      if (finalFiles.length === 0 && project?.html) {
        finalFiles = [{ path: 'index.html', content: project.html, language: 'html', fileType: 'page' }];
      }
    } else if (html) {
      finalFiles = [{ path: 'index.html', content: html, language: 'html', fileType: 'page' } as ProjectFile];
    }

    const projectContext = buildProjectContext(finalFiles, targetFile);

    const client = await getAIClient();
    
    let effectiveModelId = modelId || process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
    let effectiveProviderId = providerId;

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

**Converting Single-Page to Multi-Page (CRITICAL)**:
- When adding new pages (e.g., work.html) to an existing single-page site:
  1. FIRST create the partial (e.g., header.html) with the shared navigation/header content
  2. THEN use \`replaceElement\` or \`deleteContent\` to REMOVE the old inline header/nav from index.html
  3. THEN use \`insertContent\` to add \`<!-- include:header.html -->\` where the header was
- NEVER leave both the old inline header AND the include directive in the same file
- The include directive REPLACES the inline content, it does not supplement it

You MUST use structured tool calls to modify files. 
Available tools:
1. replaceContent(file, selector, oldContent, newContent) - Use for precise HTML changes. newContent is the INNER html.
2. replaceElement(file, selector, newContent) - Replace the matching element ENTIRELY with newContent.
3. insertContent(file, position, selector, content) - position: before, after, prepend, append.
4. deleteContent(file, selector) - Remove an element.
5. createFile(path, content, fileType) - Create a new page, style, script or partial.
6. deleteFile(path) - Remove a file.
7. updateStyle(selector, properties, action) - For precise CSS rule changes. Action: "replace" (default) or "merge".
8. updateFile(file, content) - Replace an entire file when changes are too complex for other tools.

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
      model: effectiveModelId,
      providerId: effectiveProviderId,
      systemMessage: { content: systemMessage },
    });

    // Since we need to parse the multi-file output, we can't easily stream it back as raw text
    // if we want to return a structured JSON response. 
    // However, the EditorWorkspace expects a JSON response now.

    let content = '';
    const originalFiles = finalFiles.map((file) => ({ ...file }));

    try {
      const response = await withRetry(
        () => session.sendAndWait({ prompt: userMessage }, 150000),
        { maxAttempts: 3, baseDelayMs: 800 }
      );
      content = response?.data?.content || '';

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
          if (!result.success) {
            throw new Error(result.message);
          }
        }
      } else {
        throw new Error('Not an array of tool calls');
      }
    } catch (err) {
      if (projectName) {
        throw err;
      }

      // Fallback to block parsing (legacy html-only flow)
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
    } finally {
      await session.destroy().catch(() => { });
    }

    const structure = validateFileStructure(finalFiles);
    if (!structure.valid) {
      return Response.json({
        error: `Invalid file structure: ${structure.errors.join(', ')}`,
        code: 'INVALID_FILE_STRUCTURE',
        requestId,
      }, { status: 400 });
    }

    if (projectName) {
      try {
        await saveFiles(projectName, finalFiles);
      } catch (err) {
        console.error(`[Transform ${requestId}] Failed to save files:`, err);
        return Response.json({
          error: 'Failed to save transformed files',
          code: 'SAVE_FAILED',
          requestId,
        }, { status: 500 });
      }
    }

    if (projectName) {
      const originalMap = new Map(originalFiles.map((file) => [file.path, file]));
      const updatedFiles = finalFiles.filter((file) => {
        const original = originalMap.get(file.path);
        return !original || original.content !== file.content || original.fileType !== file.fileType || original.language !== file.language;
      });
      const deletedPaths = originalFiles
        .filter((file) => !finalFiles.some((f) => f.path === file.path))
        .map((file) => file.path);

      return Response.json({ files: updatedFiles, deletedPaths, full: false, requestId });
    }

    const activePath = activeFile || 'index.html';
    const activeHtml = finalFiles.find((f) => f.path === activePath)?.content || html || '';
    return Response.json({ html: activeHtml, files: finalFiles, full: true, requestId });
  } catch (error) {
    const classified = classifyTransformError(error);
    console.error(`[Transform ${requestId}] error:`, error);
    return Response.json({ error: classified.message, code: classified.code, requestId }, { status: 500 });
  }
}
