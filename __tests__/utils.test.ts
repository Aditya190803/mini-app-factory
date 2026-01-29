import { describe, it, expect } from 'vitest';
import { buildMainPrompt, buildPolishPrompt } from '@/lib/utils';

describe('utils prompts', () => {
  it('buildMainPrompt contains guide and images section', () => {
    const prompt = buildMainPrompt('A simple coffee shop landing page');
    expect(prompt).toContain('Picsum');
    expect(prompt).toContain('Typography');
    expect(prompt).toContain('Hero section');
  });

  it('buildPolishPrompt includes animation keyframes and instruction to output COMPLETE', () => {
    const prompt = buildPolishPrompt('A coffee shop landing page');
    expect(prompt).toContain('@keyframes fadeIn');
    expect(prompt).toContain('Output the enhanced file');
    expect(prompt).toContain('<promise>COMPLETE</promise>');
  });
});
