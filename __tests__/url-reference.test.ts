import { describe, expect, it } from 'vitest';
import { formatExaContextForPrompt } from '@/lib/exa-url-context';
import { isHttpUrl, normalizeReferenceUrl } from '@/lib/url-reference';

describe('url-reference', () => {
  it('normalizes bare domains', () => {
    expect(normalizeReferenceUrl('example.com')).toBe('https://example.com');
  });

  it('detects http urls in description slot', () => {
    expect(isHttpUrl('https://stripe.com')).toBe(true);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('formats exa context for prompts', () => {
    const block = formatExaContextForPrompt({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello world',
      summary: 'A demo site',
    });
    expect(block).toContain('Reference site');
    expect(block).toContain('Hello world');
  });
});