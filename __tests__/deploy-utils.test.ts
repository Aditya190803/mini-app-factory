import { describe, expect, it } from 'vitest';
import { buildGitHubContentPayload } from '../lib/deploy-server';
import { 
  getRepoLookupTargets, 
  validateRepoName, 
  normalizeRepoName, 
  extractRepoFullNameFromUrl,
  extractNetlifySiteNameFromUrl
} from '../lib/deploy-shared';

describe('deploy helpers', () => {
  describe('repository utilities', () => {
    it('prefers linked repo before owner/name lookup', () => {
      const targets = getRepoLookupTargets({
        preferredFullName: 'acme/linked-repo',
        ownerLogin: 'acme',
        repoName: 'new-repo',
      });
      expect(targets[0]).toBe('acme/linked-repo');
      expect(targets).toContain('acme/new-repo');
    });

    it('normalizes repository names correctly', () => {
      expect(normalizeRepoName('My Awesome Project!')).toBe('my-awesome-project');
      expect(normalizeRepoName('--Leading-and-trailing--')).toBe('leading-and-trailing');
      expect(normalizeRepoName('Multiple   Spaces  and $$$ Symbols')).toBe('multiple-spaces-and-symbols');
    });

    it('extracts repo full name from various GitHub URLs', () => {
      expect(extractRepoFullNameFromUrl('https://github.com/user/repo')).toBe('user/repo');
      expect(extractRepoFullNameFromUrl('https://github.com/user/repo.git')).toBe('user/repo');
      expect(extractRepoFullNameFromUrl('http://github.com/org/my-project')).toBe('org/my-project');
      expect(extractRepoFullNameFromUrl(null)).toBeUndefined();
      expect(extractRepoFullNameFromUrl('https://other-site.com/user/repo')).toBeUndefined();
    });

    it('extracts Netlify site name from app URLs', () => {
      expect(extractNetlifySiteNameFromUrl('https://my-site.netlify.app')).toBe('my-site');
      expect(extractNetlifySiteNameFromUrl('http://dashboard.netlify.app/sites/my-site')).toBe('dashboard'); // Based on current regex logic
      expect(extractNetlifySiteNameFromUrl(null)).toBeUndefined();
    });
  });

  describe('GitHub payload builder', () => {
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

    it('encodes content to base64 correctly', () => {
      const content = 'Hello World';
      const payload = buildGitHubContentPayload({
        path: 'test.txt',
        content,
        branch: 'main',
      });
      expect(payload.content).toBe(Buffer.from(content).toString('base64'));
    });
  });

  describe('validation', () => {
    it('validates repo name input constraints', () => {
      const result = validateRepoName('bad name!');
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/only include letters/i);
    });

    it('allows valid repo names', () => {
      expect(validateRepoName('my-cool-project').valid).toBe(true);
      expect(validateRepoName('Project_123').valid).toBe(true);
    });

    it('limits repo name length', () => {
      const longName = 'a'.repeat(101);
      const result = validateRepoName(longName);
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/100 characters/i);
    });
  });
});
