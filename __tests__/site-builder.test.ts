import { describe, test, expect } from 'vitest';
import { buildReadmePrompt } from '@/lib/site-builder';

describe('site-builder utilities', () => {
  test('buildReadmePrompt includes project name and files', () => {
    const result = buildReadmePrompt('my-app', 'A cool app', ['index.html', 'style.css']);
    expect(result).toContain('my-app');
    expect(result).toContain('A cool app');
    expect(result).toContain('- index.html');
    expect(result).toContain('- style.css');
    expect(result).toContain('Mini App Factory');
  });
});
