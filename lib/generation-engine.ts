import { buildMainPrompt, stripCodeFence } from '@/lib/utils';
import { getProject, saveProject, saveFiles } from '@/lib/projects';
import { getAIClient, SessionEvent } from '@/lib/ai-client';
import { parseMultiFileOutput } from '@/lib/file-parser';
import { ProjectFile, validateFileStructure } from '@/lib/page-builder';
import { getCachedDesignSpec, setCachedDesignSpec } from '@/lib/ai-cache';
import { withRetry } from '@/lib/ai-retry';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';
import { isAIProviderId } from '@/lib/ai-admin-config';
import { DEFAULT_MODEL } from '@/lib/constants';
import { logger } from '@/lib/logger';

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function classifyGenerationError(raw: unknown): { code: string; message: string } {
  try {
    const rawMsg = typeof raw === 'string' ? raw : (raw instanceof Error ? raw.message : String(raw));
    const m = rawMsg.toLowerCase();

    if (m.includes('google_generative_ai_api_key') || m.includes('google api key') || m.includes('api_key')) {
      return {
        code: 'ENV_MISSING',
        message: 'Missing GOOGLE_GENERATIVE_AI_API_KEY. To enable AI features, set GOOGLE_GENERATIVE_AI_API_KEY in your environment or deployment variables and restart the server.'
      };
    }

    if (m.includes('google') || m.includes('gemini') || m.includes('provider returned') || m.includes('rate-limited')) {
      return {
        code: 'AI_PROVIDER_ERROR',
        message: 'AI provider error: the upstream model is temporarily unavailable or rate-limited. Check your GOOGLE_GENERATIVE_AI_API_KEY, switch providers, or try again shortly.'
      };
    }

    if (/timeout|timed out/.test(m)) return { code: 'AI_TIMEOUT', message: 'AI request timed out. Try again.' };
    if (/network|enotfound|eai_again|econnrefused|econnreset/.test(m)) {
      return { code: 'AI_NETWORK_ERROR', message: 'Network error contacting AI provider. Ensure server can reach the provider and try again.' };
    }

    // Default to the raw string but keep it concise
    const concise = rawMsg.length > 800 ? rawMsg.slice(0, 800) + '…' : rawMsg;
    return { code: 'AI_ERROR', message: concise };
  } catch {
    return { code: 'AI_ERROR', message: 'Unknown error contacting AI provider' };
  }
}

/**
 * Runs the full generation workflow: design spec → HTML → persist.
 * The workflow continues even if the client disconnects — results are saved.
 */
export async function runGeneration(
  projectName: string,
  finalPrompt: string,
  signal: AbortSignal,
  onEvent?: (event: SessionEvent) => void,
  requestId?: string,
  runtimeConfig?: AIRuntimeConfig
): Promise<{ html: string; files: ProjectFile[] } | { error: string }> {
  const project = await getProject(projectName);
  if (!project) return { error: 'Project not found during generation' };

  const promptHash = fnv1aHash(finalPrompt);
  const promptCacheKey = `${project.selectedModel || DEFAULT_MODEL}:${project.providerId || ''}:${promptHash}`;
  const projectCacheKey = `project:${projectName}:design-spec`;
  let designSpec = '';

  try {
    // Update status
    project.status = 'generating';
    await saveProject(project).catch((err) => { logger.warn('Failed to update project status', { error: err instanceof Error ? err.message : String(err) }); });

    if (signal.aborted) return { error: 'Aborted' };

    const client = await getAIClient(runtimeConfig);
    const projectProviderId = isAIProviderId(project.providerId) ? project.providerId : undefined;

    if (signal.aborted) return { error: 'Aborted' };

    // Design phase (resume-aware)
    const cachedDesign =
      (await getCachedDesignSpec(projectCacheKey)) ||
      (await getCachedDesignSpec(promptCacheKey));

    if (cachedDesign) {
      designSpec = cachedDesign;
    } else {
      const architectSystemMsg = 'You are an expert web design architect. Create a detailed design spec for the requested site.';

      const designSession = await client.createSession({
        model: project.selectedModel || DEFAULT_MODEL,
        providerId: projectProviderId,
        systemMessage: { content: architectSystemMsg },
      });

      try {
        let sessionError: Error | null = null;
        const unsubscribe = designSession.on((event) => {
          if (event.type === 'session.error') {
            sessionError = new Error(event.data.message);
            logger.error('[AI] Design session error', { message: event.data.message });
          } else if (event.type === 'provider.fallback' || event.type === 'provider.selected') {
            onEvent?.(event);
          }
        });

        try {
          const designResp = await withRetry(
            () => designSession.sendAndWait({ prompt: finalPrompt }, 120000),
            { maxAttempts: 3, baseDelayMs: 800 }
          );
          if (sessionError) throw sessionError;
          designSpec = designResp?.data?.content || '';
          if (designSpec) {
            await Promise.all([
              setCachedDesignSpec(promptCacheKey, designSpec),
              setCachedDesignSpec(projectCacheKey, designSpec),
            ]);
          }
        } finally {
          unsubscribe();
        }
      } finally {
        await designSession.destroy().catch((err) => { logger.warn('designSession.destroy failed', { error: err instanceof Error ? err.message : String(err) }); });
      }
    }

    if (signal.aborted) return { error: 'Aborted' };

    // HTML generation phase
    const developerSystemMsg = `You are an expert developer. Generate a complete multi-file website project. 
Return files using code blocks with the format:
\`\`\`html:filename.html
Code here...
\`\`\`

Mandatory requirements:
1. **Separation of Concerns**: ALWAYS put CSS in styles.css and JS in script.js. 
2. **No Inline Tags**: DO NOT use <style> or <script> tags inside HTML files.
3. **Linking**: index.html MUST include <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer></script>.
4. **Project Files**: Always include at least:
   - index.html (main landing page)
   - styles.css (common styles)
   - script.js (common interactions)

5. **Shared Partials (CRITICAL)**:
   - If the project has multiple pages, you MUST create a \`header.html\` (and \`footer.html\` if applicable).
   - DO NOT duplicate the header or footer HTML code inside individual page files.
   - Instead, use the placeholder \`<!-- include:header.html -->\` and \`<!-- include:footer.html -->\` in your HTML pages where they should appear.
   - Any shared code (navigation, branding, social links) MUST be moved to these partial files.

6. **Link Integrity & Navigation (CRITICAL)**:
   - **Zero Dead Links**: DO NOT use \`#\` for links (except for the logo if it points to home).
   - **Mandatory Page Generation**: If you link to a page (e.g. \`about.html\`, \`privacy.html\`, \`services.html\`), YOU MUST PROVIDE THE CONTENT for that page in its own code block in this same response. If you are not prepared to generate the page, DO NOT link to it.
   - **Relative Paths Only**: Always use relative filenames like \`about.html\`. NEVER use absolute paths like \`/about.html\` or \`/index.html\`.
   - **Internal Anchors**: If you link to an anchor (e.g. \`#features\`), the target element with \`id="features"\` must actually exist in the same HTML file.
   - **Footer Policy**: Legal pages (Privacy Policy, Terms of Service) are often generated as empty links. You are FORBIDDEN from adding these unless you also generate the corresponding \`privacy.html\` or \`terms.html\` files. Omit footer links if they would point nowhere.

You can also create sub-pages (e.g. about.html, gallery.html).
Return ONLY code blocks. No explanations.`;

    const htmlSession = await client.createSession({
      model: project.selectedModel || DEFAULT_MODEL,
      providerId: projectProviderId,
      systemMessage: { content: developerSystemMsg },
    });

    let html = '';
    let files: ProjectFile[] = [];
    try {
      let sessionError: Error | null = null;
      const unsubscribe = htmlSession.on((event) => {
        if (event.type === 'session.error') {
          sessionError = new Error(event.data.message);
          logger.error('[AI] HTML session error', { message: event.data.message });
        } else if (event.type === 'provider.fallback' || event.type === 'provider.selected') {
          onEvent?.(event);
        }
      });

      try {
        const mainPrompt = buildMainPrompt(finalPrompt);
        const htmlResp = await withRetry(
          () => htmlSession.sendAndWait({
            prompt: `${mainPrompt}\n\nDesign Spec:\n${designSpec}`
          }, 120000),
          { maxAttempts: 3, baseDelayMs: 800 }
        );
        if (sessionError) throw sessionError;
        
        const content = htmlResp?.data?.content || '';
        files = parseMultiFileOutput(content);
        
        if (files.length === 0) {
          html = stripCodeFence(content);
          files = [{ path: 'index.html', content: html, language: 'html', fileType: 'page' }];
        } else {
          html = files.find(f => f.path === 'index.html')?.content || '';
        }
      } finally {
        unsubscribe();
      }
    } finally {
      await htmlSession.destroy().catch((err) => { logger.warn('htmlSession.destroy failed', { error: err instanceof Error ? err.message : String(err) }); });
    }

    const structure = validateFileStructure(files);
    if (!structure.valid) {
      return { error: `Invalid file structure: ${structure.errors.join(', ')}` };
    }

    // Always save the result to the database (even if client disconnected)
    const finalProject = await getProject(projectName);
    if (finalProject) {
      finalProject.html = html;
      finalProject.status = 'completed';
      finalProject.isMultiPage = files.length > 1;
      finalProject.pageCount = files.filter(f => f.fileType === 'page').length;
      finalProject.description = designSpec.slice(0, 500);
      
      await saveProject(finalProject).catch(err => {
        logger.error('Failed to save completed project', { error: err instanceof Error ? err.message : String(err) });
      });
      
      if (files.length > 0) {
        await saveFiles(projectName, files).catch(err => {
          logger.error('Failed to save project files', { error: err instanceof Error ? err.message : String(err) });
        });
      }
    }

    return { html, files };
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    const errorInfo = classifyGenerationError(original);

    logger.error(`[Generation ${requestId ?? 'unknown'}] error`, { projectName, error: original });

    if (designSpec) {
      await setCachedDesignSpec(projectCacheKey, designSpec).catch((cacheErr) => {
        logger.warn('Failed to persist project design cache for retry', {
          projectName,
          error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        });
      });
    }

    try {
      const proj = await getProject(projectName);
      if (proj) {
        proj.status = 'error';
        proj.error = errorInfo.message;
        await saveProject(proj);
      }
    } catch (saveErr) {
      logger.warn('Failed to save error status to project', { projectName, error: saveErr instanceof Error ? saveErr.message : String(saveErr) });
    }

    return { error: errorInfo.message };
  }
}
