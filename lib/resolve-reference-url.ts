import 'server-only';

import { fetchExaUrlContext, formatExaContextForPrompt } from '@/lib/exa-url-context';
import { isHttpUrl, normalizeReferenceUrl } from '@/lib/url-reference';

/** Resolve optional reference URL into a prompt appendix (empty if none / Exa unavailable). */
export async function appendReferenceUrlToPrompt(
  basePrompt: string,
  options: { referenceUrl?: string; storedDescription?: string }
): Promise<{ prompt: string; referenceUsed?: string }> {
  const candidate =
    (options.referenceUrl?.trim() ? normalizeReferenceUrl(options.referenceUrl) : undefined) ||
    (isHttpUrl(options.storedDescription) ? normalizeReferenceUrl(options.storedDescription) : undefined);

  if (!candidate) {
    return { prompt: basePrompt };
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return {
      prompt: `${basePrompt}\n\n## Reference URL (content not fetched — set EXA_API_KEY)\n${candidate}`,
      referenceUsed: candidate,
    };
  }

  const ctx = await fetchExaUrlContext(candidate, apiKey);
  return {
    prompt: `${basePrompt}\n\n${formatExaContextForPrompt(ctx)}`,
    referenceUsed: ctx.url,
  };
}