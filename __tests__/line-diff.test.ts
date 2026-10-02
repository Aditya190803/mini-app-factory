import { describe, expect, it } from 'vitest';
import { changedFiles, diffLines } from '@/lib/line-diff';

describe('diffLines', () => {
  it('marks added and removed lines around common ones', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('gives up on pathologically large inputs instead of hanging', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n');
    expect(diffLines(big, `${big}\nmore`)).toBeNull();
  });
});

describe('changedFiles', () => {
  it('reports added, removed and changed paths', () => {
    expect(changedFiles(
      [{ path: 'a', content: '1' }, { path: 'b', content: '1' }],
      [{ path: 'a', content: '2' }, { path: 'c', content: '1' }],
    )).toEqual([
      { path: 'a', status: 'changed' },
      { path: 'b', status: 'removed' },
      { path: 'c', status: 'added' },
    ]);
  });
});
