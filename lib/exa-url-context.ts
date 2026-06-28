/** Max text from Exa passed into generation prompts. */
export const EXA_TEXT_MAX_CHARS = 12_000;

export type ExaUrlContext = {
  url: string;
  title?: string;
  text: string;
  summary?: string;
  favicon?: string;
  image?: string;
};

type ExaContentsResult = {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  favicon?: string;
  image?: string;
};

type ExaContentsResponse = {
  results?: ExaContentsResult[];
  statuses?: Array<{ id: string; status: string; error?: string }>;
};

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated]`;
}

export function formatExaContextForPrompt(ctx: ExaUrlContext): string {
  const parts = [
    '## Reference site (from URL — use for layout, tone, and content structure; do not copy verbatim)',
    `URL: ${ctx.url}`,
  ];
  if (ctx.title) parts.push(`Title: ${ctx.title}`);
  if (ctx.image) parts.push(`OG / hero image: ${ctx.image}`);
  if (ctx.favicon) parts.push(`Favicon: ${ctx.favicon}`);
  if (ctx.summary) parts.push(`Summary:\n${ctx.summary}`);
  parts.push(`Page content:\n${ctx.text}`);
  return parts.join('\n\n');
}

/** Fetch LLM-ready page context from Exa Contents API. */
export async function fetchExaUrlContext(rawUrl: string, apiKey: string): Promise<ExaUrlContext> {
  const url = normalizeUrl(rawUrl);

  const res = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      urls: [url],
      text: { maxCharacters: EXA_TEXT_MAX_CHARS, includeHtmlTags: false },
      summary: { query: 'Site purpose, audience, visual tone, and main sections' },
      livecrawl: 'fallback',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Exa API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as ExaContentsResponse;
  const failed = data.statuses?.find((s) => s.status !== 'success');
  const row = data.results?.[0];

  if (!row?.text && failed) {
    throw new Error(failed.error || `Exa could not fetch ${url}`);
  }
  if (!row?.text) {
    throw new Error('No text content returned for URL');
  }

  return {
    url: row.url || url,
    title: row.title,
    text: truncate(row.text, EXA_TEXT_MAX_CHARS),
    summary: row.summary,
    favicon: row.favicon,
    image: row.image,
  };
}