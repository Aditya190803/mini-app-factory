import { describe, it, expect } from 'vitest';
import { buildMainPrompt, buildPolishPrompt } from '@/lib/utils';

describe('utils prompts', () => {
  it('buildMainPrompt demands a working app with CSS and JS files', () => {
    const prompt = buildMainPrompt('A freelance invoice tracker');
    expect(prompt).toContain('working web application');
    expect(prompt).not.toMatch(/HTML landing page/i);
    expect(prompt).toContain('styles.css');
    expect(prompt).toContain('script.js');
    expect(prompt).toContain('localStorage');
  });

  it('buildPolishPrompt requires styles and scripts', () => {
    const prompt = buildPolishPrompt('A coffee shop booking tool');
    expect(prompt).toContain('styles.css');
    expect(prompt).toContain('script.js');
    expect(prompt).toContain('<promise>COMPLETE</promise>');
  });
});
