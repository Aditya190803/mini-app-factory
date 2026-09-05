/**
 * WorkshopBackground — the one shared backdrop for marketing and app surfaces.
 *
 * Restrained by design: a faint technical grid masked from the top, plus a
 * single whisper of the amber accent. No decorative gradients, no
 * glassmorphism, no hero-metric washes. Works in light and dark via tokens.
 */
export function WorkshopBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Technical grid, fading with distance from the top. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      {/* One amber breath at the top. The accent, kept under 10%. */}
      <div
        className="absolute inset-x-0 top-0 h-72"
        style={{
          background:
            'radial-gradient(ellipse 55% 100% at 50% 0%, color-mix(in oklab, var(--primary) 9%, transparent), transparent 70%)',
        }}
      />
      {/* Hairline where the header meets the page. */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'color-mix(in oklab, var(--foreground) 8%, transparent)' }}
      />
    </div>
  );
}
