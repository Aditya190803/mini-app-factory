import { buildPolishPrompt, stripCodeFence } from '@/lib/utils';
import { getAIClient } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { executeTool } from '@/lib/tool-executor';
import { ProjectFile } from '@/lib/page-builder';
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
import { findMigrationDrift, validateGeneratedProject } from '@/lib/generated-project-validation';

export const MAX_TRANSFORM_CONTEXT_CHARS = 120_000;

/**
 * How many times the model is given its own tool failures and asked to correct them.
 *
 * Two is a deliberate ceiling: the common causes (a selector that does not match, a path that does
 * not exist) are fixed on the first retry once the model can see the real error, and further
 * rounds mostly burn tokens on a model that has misunderstood the project.
 */
const MAX_TOOL_REPAIR_ROUNDS = 2;

type ToolFailure = { tool: string; args: Record<string, unknown>; error: string };

type ToolCall = { tool: string; args: Record<string, unknown> };

export type TransformWorkInput = {
  requestId: string;
  projectName?: string;
  html?: string;
  prompt?: string;
  projectInstructions?: string;
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
  session: { sendAndWait: (input: { prompt: string }, timeout?: number) => Promise<{ data?: { content?: string } }> },
  signal?: AbortSignal
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

    throwIfAborted(signal);
    const repaired = await withRetry(() => session.sendAndWait({ prompt: repairPrompt }, 60000), {
      maxAttempts: 2,
      baseDelayMs: 500,
      signal,
    });
    const repairedContent = repaired?.data?.content || '';
    return extractToolCalls(repairedContent);
  }
}

/**
 * Run a batch of tool calls, applying everything that works and recording what does not.
 *
 * Deliberately does not throw on a failed tool. The previous behaviour rethrew on the first
 * failure, which discarded every operation that had already been applied — so one selector that
 * did not match lost the user an entire successful edit. Failures are returned instead so the
 * caller can hand them back to the model, which is the only party able to correct them.
 *
 * Abort still throws: cancellation is not a tool failure and must not be retried.
 */
async function applyToolCalls(
  calls: ToolCall[],
  files: ProjectFile[],
  onEvent: (event: TransformStreamEvent) => void,
  signal?: AbortSignal
): Promise<{ files: ProjectFile[]; failures: ToolFailure[] }> {
  let working = files;
  const failures: ToolFailure[] = [];

  for (let i = 0; i < calls.length; i++) {
    throwIfAborted(signal);
    const call = calls[i];
    onEvent({
      status: 'applying',
      index: i + 1,
      total: calls.length,
      tool: call.tool,
      path: toolTargetPath(call.args),
    });

    let result;
    try {
      result = await executeTool(call.tool, call.args, working);
    } catch (err) {
      // executeTool throws for a disallowed tool name or a rejected path. The tool still did not
      // run, so this is safe to collect — and "you asked for a tool that does not exist" is
      // exactly the kind of mistake a repair round fixes.
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ABORTED') throw err;
      failures.push({
        tool: call.tool,
        args: call.args,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!result.success) {
      failures.push({ tool: call.tool, args: call.args, error: result.message || 'Tool reported failure' });
      continue;
    }

    for (const updated of result.updatedFiles || []) {
      const idx = working.findIndex((f) => f.path === updated.path);
      if (idx >= 0) working[idx] = updated;
      else working.push(updated);
    }
    if (result.deletedPaths?.length) {
      working = working.filter((f) => !result.deletedPaths?.includes(f.path));
    }
  }

  return { files: working, failures };
}

function describeFailures(failures: ToolFailure[]): string {
  return failures
    .map((f, i) => `${i + 1}. ${f.tool}(${JSON.stringify(f.args)})\n   failed with: ${f.error}`)
    .join('\n');
}

/** User-facing wording for failures that survived the repair rounds. Undefined when there are none. */
function describeUnresolved(failures: ToolFailure[]): string[] | undefined {
  if (failures.length === 0) return undefined;
  return failures.map((f) => {
    const target = toolTargetPath(f.args);
    return `Could not apply ${f.tool}${target ? ` to ${target}` : ''}: ${f.error}`;
  });
}

export async function runTransformWork(input: TransformWorkInput) {
  const {
    requestId,
    projectName,
    html,
    prompt,
    projectInstructions,
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
  const effectiveModelId = modelId || process.env.OPENCODE_MODEL || 'deepseek-v4-flash-free';
  const effectiveProviderId = isAIProviderId(providerId) ? providerId : undefined;

  const systemMessage = `You are an expert web developer specializing in precise, tool-based site modifications. 
You will be given the complete project context comprising all files.

Your modifications MUST maintain consistency across the entire project. For example, if you change a class name in styles.css, you must update it in all relevant HTML files.
For Cloudflare backends, keep request routing in a single import-free \`_worker.js\`, use \`env.ASSETS.fetch(request)\` for static fallthrough, access D1 through \`env.DB\`, put additive versioned SQL in \`migrations/\`, and keep \`wrangler.jsonc\` synchronized as the deployment source of truth.

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

When backend capabilities change, update \`wrangler.jsonc\` together with Worker source and migrations. Queue consumers, cron handlers, and Durable Objects use standard companion projects at \`workers/<service>/index.js\` plus \`workers/<service>/wrangler.jsonc\`. Never invent resource IDs or embed secrets.

You MUST use structured tool calls to modify files. 
Available tools:
1. replaceContent(file, selector, oldContent, newContent) - Use for precise HTML changes. newContent is the INNER html.
2. replaceElement(file, selector, newContent) - Replace the matching element ENTIRELY with newContent.
3. insertContent(file, position, selector, content) - position: before, after, prepend, append.
4. deleteContent(file, selector) - Remove an element.
5. createFile(path, content, fileType) - Create a page, partial, style, script, Cloudflare worker, D1 migration, or Cloudflare config.
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
    userMessage = `${intentBlock}${projectInstructions ? `\n\nPersistent project instructions:\n${projectInstructions}` : ''}\n\n${polishPrompt}\n\nProject Context:\n\n${projectContext}`;
  } else {
    userMessage = `${intentBlock}${projectInstructions ? `\n\nPersistent project instructions:\n${projectInstructions}` : ''}\n\nProject Context:\n\n${projectContext}\n\nModification Request:\n\n${prompt || ''}`;
  }

  const session = await client.createSession({
    model: effectiveModelId,
    providerId: effectiveProviderId,
    systemMessage: { content: systemMessage },
  });

  let content = '';
  const originalFiles = finalFiles.map((file) => ({ ...file }));
  /** Tool calls that never applied, even after the repair rounds. Surfaced, not fatal. */
  let unresolvedFailures: ToolFailure[] = [];

  try {
    throwIfAborted(signal);
    onEvent({ status: 'generating', message: 'Waiting for model…' });
    const response = await withRetry(
      () => session.sendAndWait({ prompt: userMessage }, 150000),
      { maxAttempts: 3, baseDelayMs: 800, signal }
    );
    content = response?.data?.content || '';
    throwIfAborted(signal);

    const toolCalls = await extractToolCallsWithRepair(content, session, signal);

    let applied = await applyToolCalls(toolCalls as ToolCall[], finalFiles, onEvent, signal);
    finalFiles = applied.files;

    // Hand failures back to the model rather than abandoning the work already applied. It can see
    // the actual error and the current file state, which is what it needs to emit a corrected call.
    for (let round = 0; applied.failures.length > 0 && round < MAX_TOOL_REPAIR_ROUNDS; round++) {
      throwIfAborted(signal);
      const count = applied.failures.length;
      onEvent({
        status: 'generating',
        message: `Retrying ${count} operation${count === 1 ? '' : 's'} that could not be applied…`,
      });

      const repairPrompt = [
        'Some of your tool calls could not be applied to the project.',
        '',
        describeFailures(applied.failures),
        '',
        'Emit corrected tool calls that achieve the same intent against the CURRENT project state',
        'shown below. Selectors must match content that actually exists; paths must refer to files',
        'that actually exist. Do not repeat calls that already succeeded — only fix the failures.',
        'If a failed operation is no longer necessary, omit it and return the remaining calls.',
        'Return ONLY the JSON array of tool calls.',
        '',
        'Project Context:',
        buildProjectContextWithIntent(
          finalFiles,
          selectFilesForHtmlEdit(
            applied.failures.map((f) => toolTargetPath(f.args) || '').join(' '),
            finalFiles,
            { activeFile }
          ),
          MAX_TRANSFORM_CONTEXT_CHARS
        ),
      ].join('\n');

      const repairResponse = await withRetry(
        () => session.sendAndWait({ prompt: repairPrompt }, 90_000),
        { maxAttempts: 2, baseDelayMs: 500, signal }
      );

      // The repair round is best-effort: if the model answers with an empty array, prose, or
      // anything else unparseable, keep what has been applied and stop. Letting the parse error
      // escape would abort the whole transform, which is the failure mode this loop exists to
      // remove — and "no further changes" is a legitimate answer that extractToolCalls rejects.
      let repairCalls: ToolCall[];
      try {
        repairCalls = (await extractToolCallsWithRepair(
          repairResponse?.data?.content || '',
          session,
          signal
        )) as ToolCall[];
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ABORTED') throw err;
        break;
      }
      if (repairCalls.length === 0) break;

      applied = await applyToolCalls(repairCalls, finalFiles, onEvent, signal);
      finalFiles = applied.files;
    }

    unresolvedFailures = applied.failures;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : undefined;
    if (projectName || !content || code === 'ABORTED') {
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

  const migrationDrift = findMigrationDrift(originalFiles, finalFiles);
  if (migrationDrift.length) {
    throw Object.assign(new Error(migrationDrift.join('; ')), { code: 'MIGRATION_DRIFT' });
  }
  let validation = validateGeneratedProject(finalFiles, projectName || 'preview-project');
  if (!validation.valid) {
    onEvent({ status: 'generating', message: `Repairing ${validation.errors.length} validation issue${validation.errors.length === 1 ? '' : 's'}…` });
    const repairSession = await client.createSession({
      model: effectiveModelId,
      providerId: effectiveProviderId,
      systemMessage: { content: systemMessage },
    });
    try {
      const repairResponse = await repairSession.sendAndWait({
        prompt: `${intentBlock}\n\nThe proposed project failed validation:\n- ${validation.errors.join('\n- ')}\n\nUse the available file tools to fix every issue. Return only the JSON array of tool calls.\n\nProject Context:\n${buildProjectContextWithIntent(finalFiles, selectFilesForHtmlEdit(validation.errors.join(' '), finalFiles), MAX_TRANSFORM_CONTEXT_CHARS)}`,
      }, 90_000);
      const repairs = await extractToolCallsWithRepair(repairResponse?.data?.content || '', repairSession, signal);
      // Same reasoning as the main loop: a repair call that fails should not discard the repairs
      // that worked. Whether the project is actually fixed is decided by re-running validation
      // below, which is a better signal than any individual tool's success.
      const repairApplied = await applyToolCalls(repairs as ToolCall[], finalFiles, onEvent, signal);
      finalFiles = repairApplied.files;
      unresolvedFailures = [...unresolvedFailures, ...repairApplied.failures];
    } finally {
      await repairSession.destroy().catch(() => {});
    }
    validation = validateGeneratedProject(finalFiles, projectName || 'preview-project');
  }
  if (!validation.valid) {
    throw Object.assign(new Error(`Invalid generated project: ${validation.errors.join(', ')}`), {
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
      warnings: describeUnresolved(unresolvedFailures),
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
    warnings: describeUnresolved(unresolvedFailures),
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
