import { describe, expect, test } from 'vitest';
import { classifyGitHubFile, diffProjectFiles } from '@/lib/github-sync';

describe('GitHub sync', () => {
  test('classifies Cloudflare project files', () => {
    expect(classifyGitHubFile('_worker.js')).toEqual({ language: 'javascript', fileType: 'worker' });
    expect(classifyGitHubFile('migrations/0001.sql')).toEqual({ language: 'sql', fileType: 'migration' });
    expect(classifyGitHubFile('wrangler.jsonc')).toEqual({ language: 'json', fileType: 'config' });
    expect(classifyGitHubFile('photo.png')).toBeNull();
  });

  test('reports added changed and removed files', () => {
    expect(diffProjectFiles([{ path: 'a.html', content: 'old' }, { path: 'gone.css', content: '' }], [{ path: 'a.html', content: 'new' }, { path: 'b.js', content: '' }])).toEqual({ added: ['b.js'], changed: ['a.html'], removed: ['gone.css'] });
  });
});
