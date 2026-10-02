import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG contrast of the design tokens, read straight from app/globals.css so a palette tweak that
 * breaks legibility fails here instead of in an accessibility audit.
 */

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

function block(selector: ':root' | '.dark') {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
}

function token(scope: string, name: string): [number, number, number] {
  const match = scope.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!match) throw new Error(`--${name} is not a plain oklch() value`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** OKLCH to linear-light sRGB relative luminance (Björn Ottosson's OKLab matrices). */
function luminance([l, c, h]: [number, number, number]) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(scope: string, fg: string, bg: string) {
  const [a, b] = [luminance(token(scope, fg)), luminance(token(scope, bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe.each([':root', '.dark'] as const)('%s tokens', (selector) => {
  const scope = block(selector);

  it.each([
    ['foreground', 'background', 4.5],
    ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'surface-1', 4.5],
    ['signal-text', 'surface-1', 4.5],
    ['destructive-text', 'surface-1', 4.5],
    // Form control boundaries are non-text UI: 3:1 (WCAG 1.4.11).
    ['input', 'surface-1', 3],
    ['input', 'background', 3],
  ])('%s on %s meets %s:1', (fg, bg, minimum) => {
    expect(contrast(scope, fg, bg)).toBeGreaterThanOrEqual(minimum);
  });
});
