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

**Images** (CRITICAL - use REAL photos, never emojis):
- Use Picsum with seed for themed images: https://picsum.photos/seed/coffee/800/600 (change "coffee" to relevant keyword)
- For variety, increment the seed: seed/coffee1, seed/coffee2, seed/coffee3
- Example hero: https://picsum.photos/seed/hero/1200/800
- Example feature images: https://picsum.photos/seed/feature1/600/400, seed/feature2/600/400
- Every image needs descriptive alt text
- Use object-fit: cover for consistent sizing
- NEVER use source.unsplash.com (deprecated and broken!)

**Motion & Polish**:
- Page load: fade-in with staggered delays (animation-delay: 0.1s, 0.2s, etc.)
- Hover states: subtle transforms, color shifts, or underline reveals
- Keep it minimal and meaningful - one orchestrated entrance beats scattered effects

**Accessibility**:
- Proper heading hierarchy (h1 → h2 → h3)
- Color contrast ratio 4.5:1 minimum
- Focus states for keyboard navigation
- All images have alt text

**What to AVOID** (AI red flags):
- Generic fonts: Inter, Roboto, Arial, system-ui
- Purple gradient on white background
- Emojis as image/icon placeholders
- Buzzwords without specifics ("revolutionary", "cutting-edge", "seamless")
- Cookie-cutter layouts with no personality
- Walls of text with identical paragraph lengths

## Structure
Include in one HTML file with inline <style>:
- Navigation (minimal - logo + 2-3 links max)
- Hero section (headline, subhead, CTA button)
- 2-3 content sections showcasing value
- Footer with contact/social

Output the complete, working HTML file now.`
}

/**
 * Build the polish/refinement prompt to review and enhance an existing index.html.
 */
export function buildPolishPrompt(description: string): string {
  return `Review and enhance the index.html file for: ${description}
Check and fix if needed:
1. **Images**: Ensure ALL images use Picsum URLs (NOT source.unsplash.com which is broken!)
   - Example: <img src="https://picsum.photos/seed/relevant/800/600" alt="descriptive text">
   - For variety use different seeds: seed/image1, seed/image2, seed/image3
2. **Typography**: Verify Google Fonts are loaded and applied correctly

3. **Mobile**: Test that layout works on small screens (use media queries if missing)

4. **Animations**: Add subtle entrance animations if missing:
   - @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(20px); }} to {{ opacity: 1; transform: translateY(0); }} }}
   - Apply with animation: fadeIn 0.6s ease-out forwards;

5. **Polish**: Smooth hover transitions (transition: all 0.3s ease)

Output the enhanced file:

html:index.html
[complete enhanced HTML]


When done, output: <promise>COMPLETE</promise>`
}
