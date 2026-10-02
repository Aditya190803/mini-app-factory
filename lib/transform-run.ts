import 'server-only';

import { stripCodeFence } from '@/lib/utils';
import { getAIClient, type AIClientSession } from '@/lib/ai-client';
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
import { resolveSelectedAIModel } from '@/lib/ai-admin-config';
import { resolveOpenCodeModel } from '@/lib/opencode-models';
import { resolveGatewayModel } from '@/lib/gateway-models';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import type { TransformStreamEvent } from '@/lib/transform-stream';
import { findMigrationDrift, validateGeneratedProject } from '@/lib/generated-project-validation';
import { RUN_BUDGET_MS, sumUsage } from '@/lib/ai-usage';

const MAX_TRANSFORM_CONTEXT_CHARS = 120_000;

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
  modelId?: string;
  providerId?: string;
  finalFiles: ProjectFile[];
  /**
   * The filesVersion `finalFiles` was read at. The save is made against it, so edits that land
   * while the model works are reported as a conflict instead of being overwritten.
   */
  filesVersion?: number;
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
    modelId,
    providerId,
    finalFiles: initialFiles,
    runtimeConfig,
    onEvent,
    signal,
  } = input;

  throwIfAborted(signal);
  // One budget for every model call in the transform, inside the route's maxDuration.
  const deadline = Date.now() + RUN_BUDGET_MS;
  const sessions: AIClientSession[] = [];
  const usage = () => sumUsage(...sessions.map((session) => session.usage?.()));

  let finalFiles = initialFiles.map((f) => ({ ...f }));

  let targetElementPath: string | undefined;
  if (prompt?.includes('Target element in ')) {
    const match = prompt.match(/Target element in ([a-zA-Z0-9._-]+):/);
    if (match) targetElementPath = match[1];
  }

  const intentPrompt = prompt || '';
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
  const requested = resolveSelectedAIModel(modelId, providerId);
  const effectiveModelId = requested?.providerId === 'gateway'
    ? await resolveGatewayModel(requested.model)
    : requested?.providerId === 'opencode'
      ? await resolveOpenCodeModel(requested.model)
      : requested?.model;
  const effectiveProviderId = requested?.providerId;

  const systemMessage = `You are an expert product engineer editing an existing working web application.

Keep it an application people use — forms, lists, charts, CRUD, filters — not a marketing landing page.
Always keep (or create if missing) non-empty styles.css and script.js. Do not inline CSS or JS in HTML.

Your modifications MUST stay consistent across files. If you change a class in styles.css, update every HTML file that uses it.
For Cloudflare backends, keep routing in a single import-free \`_worker.js\`, fall through with \`env.ASSETS.fetch(request)\`, access D1 through \`env.DB\`, put additive SQL in \`migrations/\`, and keep \`wrangler.jsonc\` in sync. Never invent resource IDs or embed secrets.

**Target element**: If the prompt names a target element, change that first. Selectors must be specific.

**Partials**: Use header.html / footer.html only when there are multiple pages sharing chrome. Do not split a working single-view app into empty About/Pricing pages.

You MUST return structured tool calls only.
Available tools:
1. replaceContent(file, selector, oldContent, newContent) — INNER html of the match
2. replaceElement(file, selector, newContent) — replace the whole element
3. insertContent(file, position, selector, content) — before, after, prepend, append
4. deleteContent(file, selector)
5. createFile(path, content, fileType)
6. deleteFile(path)
7. updateStyle(selector, properties, action) — action: replace (default) or merge
8. updateFile(file, content) — full file rewrite when surgical tools are not enough

FORMAT: a JSON array only:
[
  { "tool": "replaceContent", "args": { "file": "index.html", "selector": "h1", "newContent": "Hello World" } }
]

**Links**: No dead \`#\` links except the logo. Only link to files that exist or that you also createFile. Relative paths (about.html), never /about.html.
Active file focus is: ${targetFile || 'index.html'}.

Only return the JSON array. No explanations.`;

  const userMessage = `${intentBlock}${projectInstructions ? `\n\nPersistent project instructions:\n${projectInstructions}` : ''}\n\nProject Context:\n\n${projectContext}\n\nModification Request:\n\n${prompt || ''}`;

  const session = await client.createSession({
    model: effectiveModelId,
    providerId: effectiveProviderId,
    systemMessage: { content: systemMessage },
    signal,
    deadline,
  });
  sessions.push(session);

  let content = '';
  const originalFiles = finalFiles.map((file) => ({ ...file }));
  /** Tool calls that never applied, even after the repair rounds. Surfaced, not fatal. */
  let unresolvedFailures: ToolFailure[] = [];

  try {
    throwIfAborted(signal);
    onEvent({ status: 'generating', message: 'Waiting for model…' });
    let ticks = 0;
    const tick = setInterval(() => {
      ticks += 1;
      onEvent({ status: 'generating', message: `Waiting for model… (${ticks * 5}s)` });
    }, 5_000);
    let response: { data: { content: string } };
    try {
      response = await withRetry(
        () => session.sendAndWait({ prompt: userMessage }, 150000),
        { maxAttempts: 2, baseDelayMs: 800, signal }
      );
    } finally {
      clearInterval(tick);
    }
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
      signal,
      deadline,
    });
    sessions.push(repairSession);
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
    let filesVersion: number;
    try {
      filesVersion = await saveFiles(projectName, finalFiles, input.filesVersion);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('changed since they were loaded')) {
        throw Object.assign(
          new Error('The project files changed while the AI was working, so its result was not saved. Retry the request.'),
          { code: 'CONFLICT' }
        );
      }
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
      filesVersion,
      usage: usage(),
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
    usage: usage(),
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
  if (lowered.includes('changed while the ai was working')) return { code: 'CONFLICT', message };
  if (lowered.includes('time budget')) return { code: 'TIMEOUT', message: 'The request ran out of time. Try a smaller change.' };
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
