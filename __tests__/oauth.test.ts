import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { createPkcePair, sanitizeReturnTo } from '@/lib/oauth';
import { createHash } from 'node:crypto';

describe('sanitizeReturnTo', () => {
  it('keeps same-origin paths with their query and hash', () => {
    expect(sanitizeReturnTo('/edit/demo?tab=deploy#x')).toBe('/edit/demo?tab=deploy#x');
  });

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\evil.com',
    '/\t/evil.com',
    '/\t/evil.com',
    '/%0a/evil.com',
    'javascript:alert(1)',
  ])('rejects %j', (input) => {
    const result = sanitizeReturnTo(input);
    expect(result.startsWith('/')).toBe(true);
    expect(new URL(result, 'https://app.example').origin).toBe('https://app.example');
  });
});

describe('createPkcePair', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});
