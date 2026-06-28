import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';
import { getAIClient } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { executeTool } from '@/lib/tool-executor';
import { ProjectFile, validateFileStructure } from '@/lib/page-builder';
import { extractToolCalls } from '@/lib/transform-tool-calls';
import { saveFiles } from '@/lib/projects';
import {
  selectFilesForHtmlEdit,
  formatIntentForPrompt,
  buildProjectContextWithIntent,
} from '@/lib/edit-intent/context';
import { withRetry } from '@/lib/ai-retry';
import { isAIProviderId } from '@/lib/ai-admin-config';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import type { TransformStreamEvent } from '@/lib/transform-stream';

export const MAX_TRANSFORM_CONTEXT_CHARS = 120_000;

export type TransformWorkInput = {
  requestId: string;
  projectName?: string;
  html?: string;
  prompt?: string;
  activeFile?: string;
  polishDescription?: string;
  modelId?: string;
  providerId?: string;
  finalFiles: ProjectFile[];
  runtimeConfig: AIRuntimeConfig;
  onEvent: (event: TransformStreamEvent) => void;
  signal?: AbortSignal;
};

function toolTargetPath(args: Record<string, unknown>): string | undefined {
  if (typeof args.file === 'string') return args.file;
  if (typeof args.path === 'string') return args.path;
  return undefined;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw Object.assign(new Error('Transform cancelled'), { code: 'ABORTED' });
  }
}

async function extractToolCallsWithRepair(
  rawContent: string,
  session: { sendAndWait: (input: { prompt: string }, timeout?: number) => Promise<{ data?: { content?: string } }> }
) {
  try {
    return extractToolCalls(rawContent);
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    const isShapeOrJsonError =
      message.includes('invalid json in tool calls') || message.includes('invalid tool calls payload');
    if (!isShapeOrJsonError) throw err;

    const repairPrompt = [
      'Convert the following assistant output into STRICT JSON ONLY.',
      'Rules:',
      '- Output must be a JSON array.',
      '- Each item must be: {"tool":"<name>","args":{...}}',
      '- No markdown, no explanation, no code fences.',
      '- Preserve the original intent exactly.',
      '',
      'Assistant output to repair:',
      rawContent,
    ].join('\n');

    const repaired = await withRetry(() => session.sendAndWait({ prompt: repairPrompt }, 60000), {
      maxAttempts: 2,
      baseDelayMs: 500,
    });
    const repairedContent = repaired?.data?.content || '';
    return extractToolCalls(repairedContent);
  }
}

export async function runTransformWork(input: TransformWorkInput) {
  const {
    requestId,
    projectName,
    html,
    prompt,
    activeFile,
    polishDescription,
    modelId,
    providerId,
    finalFiles: initialFiles,
    runtimeConfig,
    onEvent,
    signal,
  } = input;

  throwIfAborted(signal);

  let finalFiles = initialFiles.map((f) => ({ ...f }));

  let targetElementPath: string | undefined;
  if (prompt?.includes('Target element in ')) {
    const match = prompt.match(/Target element in ([a-zA-Z0-9._-]+):/);
    if (match) targetElementPath = match[1];
  }

  const intentPrompt = (polishDescription && !prompt ? polishDescription : prompt) || '';
  const fileSelection = selectFilesForHtmlEdit(intentPrompt, finalFiles, {
    activeFile,
    targetElementPath,
  });
  const targetFile = fileSelection.focusPath;
  const projectContext = buildProjectContextWithIntent(
    finalFiles,
    fileSelection,
    MAX_TRANSFORM_CONTEXT_CHARS
  );
  const intentBlock = formatIntentForPrompt(fileSelection.editIntent, fileSelection.primaryFiles);

  onEvent({
    status: 'planning',
    message: fileSelection.editIntent.description,
    editType: fileSelection.editIntent.type,
  });

  const client = await getAIClient(runtimeConfig);
  const effectiveModelId = modelId || process.env.GOOGLE_MODEL || 'gemini-3-flash-preview';
  const effectiveProviderId = isAIProviderId(providerId) ? providerId : undefined;

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

**Link Integrity Rules (STRICT)**:
- **No Dead Links**: Keep links valid. DO NOT use \`#\` (except for the logo).
- **Page Existence Check**: Before adding a link to any file (e.g., \`about.html\`), CHECK the "Project Files" list in the context. If the file is not listed, you MUST use the \`createFile\` tool to generate it.
- **Relative Paths**: Use relative filenames (e.g., \`about.html\`), never absolute paths (e.g., \`/about.html\`).
- **Footer Policy**: Do not add links to Privacy/Terms pages unless you are actually creating those files. 
- **Consistency**: If you rename or delete a file, you MUST update all links in all other files using the appropriate tools.
- Active file focus is: ${targetFile || 'index.html'}.

Only return changes. No explanations.`;

  let userMessage: string;
  if (polishDescription && !prompt) {
    const polishPrompt = buildPolishPrompt(polishDescription);
    userMessage = `${intentBlock}\n\n${polishPrompt}\n\nProject Context:\n\n${projectContext}`;
  } else {
    userMessage = `${intentBlock}\n\nProject Context:\n\n${projectContext}\n\nModification Request:\n\n${prompt || ''}`;
  }

  const session = await client.createSession({
    model: effectiveModelId,
    providerId: effectiveProviderId,
    systemMessage: { content: systemMessage },
  });

  let content = '';
  const originalFiles = finalFiles.map((file) => ({ ...file }));

  try {
    throwIfAborted(signal);
    onEvent({ status: 'generating', message: 'Waiting for model…' });
    const response = await withRetry(
      () => session.sendAndWait({ prompt: userMessage }, 150000),
      { maxAttempts: 3, baseDelayMs: 800 }
    );
    content = response?.data?.content || '';
    throwIfAborted(signal);

    const toolCalls = await extractToolCallsWithRepair(content, session);
    const total = toolCalls.length;
    for (let i = 0; i < toolCalls.length; i++) {
      throwIfAborted(signal);
      const call = toolCalls[i];
      onEvent({
        status: 'applying',
        index: i + 1,
        total,
        tool: call.tool,
        path: toolTargetPath(call.args as Record<string, unknown>),
      });
      const result = await executeTool(call.tool, call.args, finalFiles as ProjectFile[]);
      if (result.success && result.updatedFiles) {
        result.updatedFiles.forEach((uf) => {
          const idx = finalFiles.findIndex((f) => f.path === uf.path);
          if (idx >= 0) finalFiles[idx] = uf;
          else finalFiles.push(uf);
        });
      }
      if (result.success && result.deletedPaths) {
        finalFiles = finalFiles.filter((f) => !result.deletedPaths?.includes(f.path));
      }
      if (!result.success) {
        throw new Error(result.message);
      }
    }
  } catch (err) {
    if (projectName) {
      throw err;
    }
    const updatedFiles = parseMultiFileOutput(content);
    if (updatedFiles.length > 0) {
      updatedFiles.forEach((uf) => {
        const idx = finalFiles.findIndex((f) => f.path === uf.path);
        if (idx >= 0) finalFiles[idx] = uf;
        else finalFiles.push(uf);
      });
    } else if (
      content &&
      content.length > 50 &&
      (content.includes('<html>') ||
        content.includes('<div') ||
        content.includes('function') ||
        content.includes('const '))
    ) {
      const activePath = activeFile || 'index.html';
      const idx = finalFiles.findIndex((f) => f.path === activePath);
      if (idx >= 0) finalFiles[idx].content = stripCodeFence(content);
    }
  } finally {
    await session.destroy().catch(() => {});
  }

  const structure = validateFileStructure(finalFiles);
  if (!structure.valid) {
    throw Object.assign(new Error(`Invalid file structure: ${structure.errors.join(', ')}`), {
      code: 'INVALID_FILE_STRUCTURE',
    });
  }

  if (projectName) {
    onEvent({ status: 'saving', message: 'Persisting files…' });
    try {
      await saveFiles(projectName, finalFiles);
    } catch (err) {
      console.error(`[Transform ${requestId}] save failed:`, err);
      throw Object.assign(new Error('Failed to save transformed files'), { code: 'SAVE_FAILED' });
    }

    const originalMap = new Map(originalFiles.map((file) => [file.path, file]));
    const updatedFiles = finalFiles.filter((file) => {
      const original = originalMap.get(file.path);
      return (
        !original ||
        original.content !== file.content ||
        original.fileType !== file.fileType ||
        original.language !== file.language
      );
    });
    const deletedPaths = originalFiles
      .filter((file) => !finalFiles.some((f) => f.path === file.path))
      .map((file) => file.path);

    onEvent({
      status: 'complete',
      requestId,
      full: false,
      files: updatedFiles,
      deletedPaths,
    });
    return;
  }

  const activePath = activeFile || 'index.html';
  const activeHtml = finalFiles.find((f) => f.path === activePath)?.content || html || '';
  onEvent({
    status: 'complete',
    requestId,
    full: true,
    html: activeHtml,
    files: finalFiles,
  });
}

export function classifyTransformError(raw: unknown) {
  const message = raw instanceof Error ? raw.message : String(raw ?? 'Transform failed');
  const lowered = message.toLowerCase();
  if (lowered.includes('cancelled') || lowered.includes('aborted')) {
    return { code: 'ABORTED', message };
  }
  if (lowered.includes('failed to save transformed')) return { code: 'SAVE_FAILED', message };
  if (lowered.includes('invalid payload')) return { code: 'INVALID_PAYLOAD', message };
  if (lowered.includes('rate limit')) return { code: 'RATE_LIMITED', message };
  if (lowered.includes('unauthorized') || lowered.includes('authentication')) {
    return { code: 'UNAUTHORIZED', message };
  }
  if (lowered.includes('invalid file structure')) return { code: 'INVALID_FILE_STRUCTURE', message };
  if (
    lowered.includes('tool not allowed') ||
    lowered.includes('invalid tool calls payload') ||
    lowered.includes('invalid json in tool calls') ||
    lowered.includes('invalid selector') ||
    lowered.includes('invalid file path') ||
    lowered.includes('not an array of tool calls') ||
    lowered.includes('unexpected token')
  ) {
    return { code: 'INVALID_TOOL_CALL', message };
  }
  return { code: 'TRANSFORM_ERROR', message };
}