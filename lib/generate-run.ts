import 'server-only';

import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject, saveFiles } from '@/lib/projects';
import { AIRunStoppedError, getAIClient, type AIClientSession, type SessionEvent } from '@/lib/ai-client';
import type { AIUsage } from '@/lib/ai-usage';
import { parseMultiFileOutput } from '@/lib/file-parser';
import type { ProjectFile } from '@/lib/page-builder';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import { DEFAULT_PROVIDER_MODELS, resolveSelectedAIModel, type AIProviderId } from '@/lib/ai-admin-config';
import { resolveOpenCodeModel } from '@/lib/opencode-models';
import { resolveGatewayModel } from '@/lib/gateway-models';
import { validateGeneratedProject } from '@/lib/generated-project-validation';
import { RUN_BUDGET_MS, sumUsage } from '@/lib/ai-usage';
import { reportError } from '@/lib/error-reporting';

export function classifyGenerationError(raw: unknown): { code: string; message: string } {
  try {
    const rawMsg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    const m = rawMsg.toLowerCase();

    if (
      m.includes('at least one ai provider key') ||
      m.includes('no enabled provider with a valid key') ||
      m.includes('missing ai provider key')
    ) {
      return {
        code: 'ENV_MISSING',
        message: 'Missing AI provider key. Set AI_GATEWAY_API_KEY or OPENCODE_API_KEY and restart the server.'
      };
    }

    if (m.includes('time budget')) {
      return { code: 'RUN_TIMEOUT', message: 'The build ran out of time. Try a smaller request, or retry.' };
    }

    if (/authentication failed|unauthorized|invalid.*api key|\b401\b|\b403\b/.test(m)) {
      return {
        code: 'AI_AUTH_ERROR',
        message: 'The AI provider rejected the configured key. Replace it in Settings or .env.local and try again.'
      };
    }

    if (m.includes('opencode') || m.includes('gateway') || m.includes('provider returned') || m.includes('rate-limited')) {
      return {
        code: 'AI_PROVIDER_ERROR',
        message: 'The AI provider is unavailable or rate-limited. Check your provider key, switch providers, or try again shortly.'
      };
    }

    if (/timeout|timed out/.test(m)) return { code: 'AI_TIMEOUT', message: 'AI request timed out. Try again.' };
    if (/network|enotfound|eai_again|econnrefused|econnreset/.test(m)) {
      return { code: 'AI_NETWORK_ERROR', message: 'Network error contacting AI provider. Ensure server can reach the provider and try again.' };
    }
    if (m.includes('failed to save')) return { code: 'SAVE_FAILED', message: rawMsg.slice(0, 400) };

    const concise = rawMsg.length > 800 ? rawMsg.slice(0, 800) + '…' : rawMsg;
    return { code: 'AI_ERROR', message: concise };
  } catch {
    return { code: 'AI_ERROR', message: 'Unknown error contacting AI provider' };
  }
}

type ProgressEvent = { status: string; message: string; path?: string };

/** Keep the activity feed alive while a long model call is in flight. */
async function waitWithProgress<T>(
  work: Promise<T>,
  onProgress: ((event: ProgressEvent) => void) | undefined,
  status: string,
  baseMessage: string,
  intervalMs = 12_000,
): Promise<T> {
  let ticks = 0;
  const timer = setInterval(() => {
    ticks += 1;
    onProgress?.({ status, message: `${baseMessage} (${ticks * (intervalMs / 1000)}s)` });
  }, intervalMs);
  try {
    return await work;
  } finally {
    clearInterval(timer);
  }
}

const ARCHITECT_SYSTEM = 'You are an expert product engineer. Spec the real working app: screens, data, and interactions people use. Never spec a marketing landing page, hero+CTA brochure, or empty About/Pricing pages.';

const DEVELOPER_SYSTEM = `You are an expert developer. Generate a complete multi-file web APPLICATION (not a marketing landing page).
Return files using code blocks with the format:
\`\`\`html:filename.html
Code here...
\`\`\`
Use \`javascript:_worker.js\` for a Cloudflare backend, \`jsonc:wrangler.jsonc\` for Cloudflare configuration, and \`sql:migrations/0001_init.sql\` for D1 migrations.

Mandatory requirements:
1. **Product first**: Ship the actual tool UI the user asked for (forms, tables, charts, filters, CRUD). A hero+CTA brochure with no working app is a failure.
2. **Separation of Concerns**: ALWAYS put CSS in styles.css and JS in script.js.
3. **No Inline Tags**: DO NOT use <style> or <script> tags inside HTML files.
4. **Linking**: index.html MUST include <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer></script>.
5. **Required files** (never omit):
   - index.html (app shell / primary UI)
   - styles.css (complete non-empty stylesheet)
   - script.js (working client logic; use localStorage when no backend is needed)
6. **Shared Partials**: Only split header.html / footer.html when there are multiple real app views sharing chrome. Do not invent About/Pricing/Features pages.
7. **Link Integrity**: No dead "#" links. Only link to files you also generate, or same-page anchors. Relative paths only (about.html, never /about.html).
8. **Cloudflare Backend** when the product needs shared APIs, auth, or persistence beyond localStorage:
   - One import-free \`_worker.js\` with \`export default { async fetch(request, env) { ... } }\`.
   - Fall through with \`return env.ASSETS.fetch(request)\`.
   - Generate \`wrangler.jsonc\` (main: _worker.js). Never invent resource IDs.
   - D1 via env.DB + additive migrations/ SQL when relational data is needed.
   - Match frontend fetch calls to real /api/* routes. Include GET /api/health.

Return ONLY code blocks. No explanations.`;

/** The build target the user picked (a template or starter), stated to the model. */
function targetInstruction(target: 'static' | 'edge' | undefined) {
  if (target === 'edge') return '\n\nBuild target: edge. Include the Cloudflare Worker (_worker.js), wrangler.jsonc, and the storage bindings this app needs.';
  if (target === 'static') return '\n\nBuild target: static. Do not add a Worker, wrangler.jsonc, or migrations; keep any state in localStorage.';
  return '';
}

export type GenerationResult =
  | { html: string; files: ProjectFile[]; usage: AIUsage }
  | { error: string; cancelled?: boolean; usage: AIUsage };

/**
 * Runs the first build of a project and persists it. Keeps going if the browser disconnects; the
 * durable run record lets the UI recover.
 *
 * `signal` aborts in-flight model calls (the user pressed Stop). All model calls share one time
 * budget so the run finishes, or fails cleanly, inside the route's maxDuration.
 */
export async function runGeneration(params: {
  projectName: string;
  prompt: string;
  signal: AbortSignal;
  onEvent?: (event: SessionEvent) => void;
  requestId?: string;
  runtimeConfig?: AIRuntimeConfig;
  onProgress?: (event: ProgressEvent) => void;
  budgetMs?: number;
  /** Retry on a specific provider (its admin default model), e.g. after the other one failed. */
  providerOverride?: AIProviderId;
}): Promise<GenerationResult> {
  const { projectName, prompt: finalPrompt, signal, onEvent, requestId, runtimeConfig, onProgress } = params;
  const deadline = Date.now() + (params.budgetMs ?? RUN_BUDGET_MS);
  const sessions: AIClientSession[] = [];
  const usage = () => sumUsage(...sessions.map((session) => session.usage?.()));

  const project = await getProject(projectName);
  if (!project) return { error: 'Project not found during generation', usage: usage() };

  try {
    // Honor the model the user picked in the selector; only fall back to the default when nothing
    // valid was stored on the project.
    const override = params.providerOverride;
    const requested = override
      ? { providerId: override, model: runtimeConfig?.adminConfig.providers[override]?.defaultModel ?? DEFAULT_PROVIDER_MODELS[override] }
      : resolveSelectedAIModel(project.selectedModel, project.providerId);
    const liveModel = requested?.providerId === 'gateway'
      ? await resolveGatewayModel(requested.model)
      : requested?.providerId === 'opencode'
        ? await resolveOpenCodeModel(requested.model)
        : requested?.model;
    project.status = 'generating';
    if (requested) {
      project.selectedModel = liveModel ?? requested.model;
      project.providerId = requested.providerId;
    }
    await saveProject(project);

    const client = await getAIClient(runtimeConfig);
    const sessionOptions = {
      model: liveModel ?? requested?.model,
      providerId: requested?.providerId,
      signal,
      deadline,
    };
    const openSession = async (system: string) => {
      const session = await client.createSession({ ...sessionOptions, systemMessage: { content: system } });
      sessions.push(session);
      session.on((event) => {
        if (event.type === 'provider.fallback' || event.type === 'provider.selected') onEvent?.(event);
      });
      return session;
    };

    onProgress?.({ status: 'planning', message: 'Planning the app UI, data, and any backend' });
    const designSession = await openSession(ARCHITECT_SYSTEM);
    let designSpec = '';
    try {
      const designResp = await waitWithProgress(
        designSession.sendAndWait({
          prompt: `Spec a working application for this request. Include the primary UI, data, and interactions. Do not spec a marketing site.\n\nRequest:\n${finalPrompt}`,
          maxOutputTokens: 1600,
        }, 60000),
        onProgress,
        'planning',
        'Planning the app UI, data, and any backend',
      );
      designSpec = designResp?.data?.content || '';
    } finally {
      await designSession.destroy().catch(() => { });
    }

    onProgress?.({ status: 'generating', message: 'Generating the project files' });
    const htmlSession = await openSession(DEVELOPER_SYSTEM);
    let html = '';
    let files: ProjectFile[] = [];
    try {
      const htmlResp = await waitWithProgress(
        htmlSession.sendAndWait({
          prompt: `${buildMainPrompt(finalPrompt)}${targetInstruction(project.target)}\n\nDesign Spec:\n${designSpec}`,
          maxOutputTokens: 8000,
        }, 120000),
        onProgress,
        'generating',
        'Generating the project files',
      );
      const content = htmlResp?.data?.content || '';
      files = parseMultiFileOutput(content);
      for (const file of files) {
        onProgress?.({ status: 'file', message: `Created ${file.path}`, path: file.path });
      }
      if (files.length === 0) {
        html = stripCodeFence(content);
        files = [{ path: 'index.html', content: html, language: 'html', fileType: 'page' }];
      } else {
        html = files.find(f => f.path === 'index.html')?.content || '';
      }
    } finally {
      await htmlSession.destroy().catch(() => { });
    }

    onProgress?.({ status: 'validating', message: 'Validating project structure, Worker routes, migrations, and Wrangler configuration' });
    let validation = validateGeneratedProject(files, projectName);
    if (!validation.valid) {
      onProgress?.({ status: 'repairing', message: `Repairing ${validation.errors.length} validation issue${validation.errors.length === 1 ? '' : 's'}` });
      const repairSession = await openSession(DEVELOPER_SYSTEM);
      try {
        const currentFiles = files.map((file) => `\n\`\`\`${file.language}:${file.path}\n${file.content}\n\`\`\``).join('');
        const repair = await repairSession.sendAndWait({
          prompt: `The generated project failed validation:\n- ${validation.errors.join('\n- ')}\n\nReturn the complete corrected project as code blocks. Preserve the requested product and fix every listed issue.\n${currentFiles}`,
          maxOutputTokens: 8000,
        }, 120_000);
        const repairedFiles = parseMultiFileOutput(repair?.data?.content || '');
        if (repairedFiles.length > 0) files = repairedFiles;
      } finally {
        await repairSession.destroy().catch(() => {});
      }
      validation = validateGeneratedProject(files, projectName);
    }
    if (!validation.valid) throw new Error(`Generated project validation failed: ${validation.errors.join('; ')}`);
    onProgress?.({ status: 'validation', message: `All generated-project checks passed${validation.warnings.length ? ` with ${validation.warnings.length} warning(s)` : ''}` });

    onProgress?.({ status: 'saving', message: 'Saving the project and creating its first version' });
    // Files first, then the status. Marking the project completed before the files were saved
    // (and swallowing both errors) reported success for builds that had saved nothing.
    try {
      await saveFiles(projectName, files);
    } catch (err) {
      throw new Error(`Failed to save the generated files: ${err instanceof Error ? err.message : String(err)}`);
    }
    const finalProject = await getProject(projectName);
    if (!finalProject) throw new Error('Failed to save: the project was deleted during the build');
    finalProject.html = html;
    finalProject.status = 'completed';
    finalProject.isMultiPage = files.length > 1;
    finalProject.pageCount = files.filter(f => f.fileType === 'page').length;
    finalProject.description = designSpec.slice(0, 500);
    await saveProject(finalProject);

    return { html, files, usage: usage() };
  } catch (err) {
    const cancelled = err instanceof AIRunStoppedError && signal.aborted;
    const original = err instanceof Error ? err.message : String(err);
    const errorInfo = classifyGenerationError(original);
    if (!cancelled) await reportError(err, { source: 'generate', requestId, project: projectName, code: errorInfo.code });

    try {
      const proj = await getProject(projectName);
      if (proj) {
        // The reason lives on the run record (finishRun), which the editor reads.
        proj.status = 'error';
        await saveProject(proj);
      }
    } catch { /* the project may be gone */ }

    return { error: cancelled ? 'Aborted' : errorInfo.message, cancelled, usage: usage() };
  }
}
