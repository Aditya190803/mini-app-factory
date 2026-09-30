import { describe, expect, it } from 'vitest';
import { normalizeCloudflareProjectName, validateProjectName } from '@/lib/deploy-shared';
import { executeTool } from '@/lib/tool-executor';
import type { ProjectFile } from '@/lib/page-builder';

describe('validateProjectName', () => {
  it.each(['a', 'todo-app', 'x1-y2', 'a'.repeat(58)])('accepts %s', (name) => {
    expect(validateProjectName(name)).toBeNull();
  });

  it.each(['', '-x', '--x', 'x-', '---', 'a--b', 'Upper', 'a_b', 'a'.repeat(59)])('rejects %j', (name) => {
    expect(validateProjectName(name)).not.toBeNull();
  });
});

describe('normalizeCloudflareProjectName', () => {
  it('keeps names that already fit', () => {
    expect(normalizeCloudflareProjectName('My App')).toBe('my-app');
  });

  it('does not collapse two long names with a shared prefix into one', () => {
    const prefix = 'a'.repeat(60);
    const first = normalizeCloudflareProjectName(`${prefix}-first`);
    const second = normalizeCloudflareProjectName(`${prefix}-second`);
    expect(first).not.toBe(second);
    for (const name of [first, second]) {
      expect(name.length).toBeLessThanOrEqual(58);
      expect(name).toMatch(/^[a-z0-9].*[a-z0-9]$/);
    }
  });
});

describe('batchEdit', () => {
  it('leaves the caller\'s files untouched when a later step fails', async () => {
    const files: ProjectFile[] = [
      { path: 'styles.css', content: 'body { color: red; }', language: 'css', fileType: 'style' },
    ];
    const result = await executeTool('batchEdit', {
      operations: [
        { name: 'updateStyle', arguments: { selector: 'body', properties: { color: 'blue' } } },
        { name: 'deleteContent', arguments: { file: 'missing.html', selector: 'h1' } },
      ],
    }, files);
    expect(result.success).toBe(false);
    expect(files[0].content).toBe('body { color: red; }');
  });
});
