import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strips code fences (backticks) from the generated code.
 */
export function stripCodeFence(code: string): string {
  if (!code) return '';
  
  // Try to find a code block
  const blockMatch = code.match(/```(?:\w+)?(?::[^\n]+)?\n([\s\S]*?)\n```/);
  if (blockMatch) {
    return blockMatch[1]!.trim();
  }

  // If no block found but it starts with backticks, try to clean it manually
  let cleaned = code.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:\w+)?(?::[^\n]+)?\n?/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```$/, '');
  }
  
  return cleaned.trim();
}

/**
 * Build the main generation prompt. This must produce a working product, not a
 * marketing shell. Past prompts that said "landing page" trained the model to
 * emit hero + CTA and skip the actual tool UI, styles, and scripts.
 */
export function buildMainPrompt(description: string): string {
  return `Build a complete, working web application for: ${description}

This is an application people use, not a marketing landing page. Ship the real
product UI (forms, lists, dashboards, charts, settings — whatever the request
needs) with working browser behavior. A decorative homepage alone is a failure.

## Required files (every project)
You MUST output at least these three files as separate code blocks:
1. \`index.html\` — app shell, links to styles.css and script.js (no inline <style> or <script>)
2. \`styles.css\` — all visual design (never empty, never omit this file)
3. \`script.js\` — all interactivity and client logic (never empty for interactive apps)

Optional when needed: \`header.html\`, \`footer.html\`, extra pages, \`_worker.js\`,
\`wrangler.jsonc\`, \`migrations/*.sql\`, \`cloudflare.manifest.json\`.

Code block format (required):
\`\`\`html:index.html
...
\`\`\`
\`\`\`css:styles.css
...
\`\`\`
\`\`\`javascript:script.js
...
\`\`\`

## Product rules
- Implement the workflow the user asked for on first load (create, list, filter,
  edit, delete, chart, etc.). Do not stop at "Sign up" marketing copy.
- If data is needed and no backend is required, use localStorage (or IndexedDB)
  so the app works offline in preview.
- If the product needs a real API, auth, or shared database, add a Cloudflare
  Worker (\`_worker.js\`) with matching \`/api/*\` routes and \`wrangler.jsonc\`.
- Prefer one cohesive multi-view app (tabs or hash routes) over a brochure site
  with empty About/Pricing pages.

## Design (apply in styles.css)
- Pick ONE distinctive Google Fonts pairing (not Inter/Roboto/Arial/system-ui).
- Commit to one clear palette. No purple-on-white defaults.
- Readable type scale, spacing, and mobile layout.
- Subtle motion only where it helps (hover, entrance).

## Hard bans
- Do not ship HTML without styles.css and script.js code blocks.
- Do not put CSS/JS inline in HTML.
- Do not use \`#\` dead links. Only link to files you also generate, or in-page anchors.
- Do not use absolute paths like \`/about.html\` — use \`about.html\`.
- Do not invent Cloudflare resource IDs.

Return ONLY the code blocks. No preamble.`
}

/**
 * Build the polish/refinement prompt to review and enhance an existing index.html.
 */
export function buildPolishPrompt(description: string): string {
  return `Review and enhance the application for: ${description}

You must keep (or create) separate files:
- index.html
- styles.css (complete visual design — never leave this missing or empty)
- script.js (working behavior for the product)

Check and fix:
1. Typography: Google Fonts loaded and applied in CSS
2. Mobile: layout works on small screens
3. Product completeness: the actual tool UI works, not just a hero section
4. Polish: subtle entrance/hover transitions where helpful

Output the complete corrected files as code blocks:

\`\`\`html:index.html
...
\`\`\`
\`\`\`css:styles.css
...
\`\`\`
\`\`\`javascript:script.js
...
\`\`\`

When done, output: <promise>COMPLETE</promise>`
}
