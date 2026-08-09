/**
 * Response headers for the routes that serve model-generated, user-controlled HTML/CSS/JS
 * (`/results/*` and `/preview/*`).
 *
 * Why: those routes return arbitrary generated markup from this app's own origin. Without
 * containment, a `<script>` in a published site runs with full access to the origin — it can
 * read `localStorage` (where BYOK provider keys are mirrored) and `fetch('/api/...')` with the
 * viewer's Stack Auth cookies attached.
 *
 * The `sandbox` CSP directive forces the response into an *opaque* origin, which removes both
 * of those capabilities while leaving the generated site's own JS, forms, and links working.
 *
 * Known tradeoff: an opaque origin also denies the generated site access to its OWN
 * `localStorage`/`sessionStorage`, so a generated page that persists state (a theme toggle, say)
 * will not remember it. That is deliberate for now — the correct fix is serving user content
 * from a separate origin (e.g. `*.user-content.<domain>`), at which point this sandbox can be
 * relaxed. Until that exists, containment beats convenience.
 */
const SANDBOX = [
  'allow-scripts',
  'allow-forms',
  'allow-popups',
  'allow-modals',
  // Link clicks navigate; programmatic top-level redirects do not.
  'allow-top-navigation-by-user-activation',
  'allow-downloads',
].join(' ');

export function userContentHeaders(
  contentType: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': `sandbox ${SANDBOX}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  };
}
