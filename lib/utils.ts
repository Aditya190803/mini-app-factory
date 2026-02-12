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
    return blockMatch[1].trim();
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
 * Build the main generation prompt according to 2026 design guidelines and AI avoid-list.
 */
export function buildMainPrompt(description: string): string {
  return `Create a complete, production-ready HTML landing page for: ${description}

Output the complete code in a fenced code block:

html:index.html
[your complete HTML here]


## 2026 Design Requirements

**Typography** (pick ONE distinctive pairing from Google Fonts):
- Display: Playfair Display, Cormorant Garamond, Fraunces, Libre Baskerville, DM Serif Display, or Instrument Serif
- Body: Source Sans 3, Karla, Work Sans, Manrope, or Outfit
- Use large, bold headlines (clamp(2.5rem, 5vw, 4.5rem))
- Headlines should sound natural, not clever or marketing-speak

**Color & Theme** (commit to ONE aesthetic):
- Dark moody: Deep charcoal (#1a1a1a to #2d2d2d) with warm amber (#e8934c) or copper accents
- Light editorial: Off-white (#faf9f6) with deep navy (#1a2332) and gold details
- Warm organic: Cream (#f5f0e8) with terracotta (#c4673d) and forest (#2d4a3e)
- Bold modern: Near-black with electric accents (cyan #00d9ff, magenta #ff006e, or lime #b5ff00)
Pick one. Execute it fully. No timid, evenly-distributed palettes.

**Layout**:
- Hero section with ONE clear message and ONE call-to-action
- Strategic negative space (don't fill every pixel)
- Asymmetric grid or intentional overlap for visual interest
- Mobile-first: thumb-friendly buttons, readable on small screens

**Motion & Polish**:
- Page load: fade-in with staggered delays (animation-delay: 0.1s, 0.2s, etc.)
- Hover states: subtle transforms, color shifts, or underline reveals
- Keep it minimal and meaningful - one orchestrated entrance beats scattered effects

**Accessibility**:
- Proper heading hierarchy (h1 → h2 → h3)
- Color contrast ratio 4.5:1 minimum
- Focus states for keyboard navigation

**What to AVOID** (AI red flags):
- Generic fonts: Inter, Roboto, Arial, system-ui
- Purple gradient on white background
- Buzzwords without specifics ("revolutionary", "cutting-edge", "seamless")
- Cookie-cutter layouts with no personality
- Walls of text with identical paragraph lengths
- **INLINE CSS/JS**: Never use <style> or <script> tags inside HTML files.
- **DUPLICATION**: Never repeat the same header/footer code across multiple HTML files.
- **BROKEN LINKS (CRITICAL)**: DO NOT use "#" for links. DO NOT link to files like "about.html" or "privacy.html" unless you are actually providing those code blocks in this response.

**LINK INTEGRITY (ZERO TOLERANCE)**:
1. **Valid Destinations**: Every link (\`<a>\` tag) must resolve.
2. **Mandatory File Generation**: If you link to \`pagename.html\`, you MUST include a \`pagename.html\` code block. If you are not generating it, remove the link or change it to an anchor in the same page (e.g., \`#contact\`).
3. **No Absolute Paths**: Use \`about.html\`, NOT \`/about.html\`.
4. **Clean Footer**: It is better to have NO links in the footer than to have links that point nowhere or to "#".

## Structure
Split the project into multiple files for better organization:
- **index.html**: Main structure, linking to styles.css and script.js.
- **styles.css**: All CSS rules and animations.
- **script.js**: All interactive functionality.
- **header.html & footer.html**: (MANDATORY for multiple pages) Extract shared navigation and branding into these partials.
- Use \`<!-- include:header.html -->\` and \`<!-- include:footer.html -->\` in your HTML pages where they should appear.

Output each file in its own code block using the format:
\`\`\`html:index.html
[content]
\`\`\`

\`\`\`css:styles.css
[content]
\`\`\`

\`\`\`javascript:script.js
[content]
\`\`\`

Output the complete, working project now.`
}

/**
 * Build the polish/refinement prompt to review and enhance an existing index.html.
 */
export function buildPolishPrompt(description: string): string {
  return `Review and enhance the index.html file for: ${description}
Check and fix if needed:
1. **Typography**: Verify Google Fonts are loaded and applied correctly

2. **Mobile**: Test that layout works on small screens (use media queries if missing)

3. **Animations**: Add subtle entrance animations if missing:
   - @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(20px); }} to {{ opacity: 1; transform: translateY(0); }} }}
   - Apply with animation: fadeIn 0.6s ease-out forwards;

4. **Polish**: Smooth hover transitions (transition: all 0.3s ease)

Output the enhanced file:

html:index.html
[complete enhanced HTML]


When done, output: <promise>COMPLETE</promise>`
}
