import { describe, expect, it } from 'vitest';
import { buildGitHubContentPayload } from '../lib/deploy-server';
import { getRepoLookupTargets, validateRepoName } from '../lib/deploy-shared';

describe('deploy helpers', () => {
  it('prefers linked repo before owner/name lookup', () => {
    const targets = getRepoLookupTargets({
      preferredFullName: 'acme/linked-repo',
      ownerLogin: 'acme',
      repoName: 'new-repo',
    });
    expect(targets[0]).toBe('acme/linked-repo');
    expect(targets).toContain('acme/new-repo');
  });

  it('includes sha when updating existing files', () => {
    const payload = buildGitHubContentPayload({
      path: 'index.html',
      content: '<h1>Hello</h1>',
      branch: 'main',
      existingSha: 'abc123',
    });
    expect(payload.message).toMatch(/^Update/);
    expect(payload).toHaveProperty('sha', 'abc123');
  });

  it('validates repo name input constraints', () => {
    const result = validateRepoName('bad name!');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/only include letters/i);
  });
});
