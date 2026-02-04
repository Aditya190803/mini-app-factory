import { describe, test, expect, beforeEach } from 'vitest';
import { executeTool } from '@/lib/tool-executor';
import { ProjectFile } from '@/lib/page-builder';

describe('tool-executor', () => {
  let initialFiles: ProjectFile[];

  beforeEach(() => {
    initialFiles = [
      {
        path: 'index.html',
        content: '<html><body><div id="target">Old</div></body></html>',
        language: 'html',
        fileType: 'page'
      },
      {
        path: 'styles.css',
        content: '.title { color: red; }',
        language: 'css',
        fileType: 'style'
      }
    ];
  });

  test('replaceContent changes HTML correctly', async () => {
    const result = await executeTool('replaceContent', {
      file: 'index.html',
      selector: '#target',
      newContent: 'New'
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles![0].content).toContain('<div id="target">New</div>');
  });

  test('insertContent appends content', async () => {
    const result = await executeTool('insertContent', {
      file: 'index.html',
      selector: 'body',
      position: 'append',
      content: '<footer>Foot</footer>'
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles![0].content).toContain('<div id="target">Old</div><footer>Foot</footer>');
  });

  test('createFile adds a new file to the list', async () => {
    const result = await executeTool('createFile', {
      path: 'about.html',
      content: '<h1>About</h1>',
      fileType: 'page'
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles).toHaveLength(1);
    expect(result.updatedFiles![0].path).toBe('about.html');
  });

  test('deleteFile returns the path to delete', async () => {
    const result = await executeTool('deleteFile', { path: 'index.html' }, initialFiles);
    expect(result.success).toBe(true);
    expect(result.deletedPaths).toContain('index.html');
  });

  test('batchEdit applies multiple operations', async () => {
    const result = await executeTool('batchEdit', {
      operations: [
        { name: 'createFile', arguments: { path: 'style.css', content: '', fileType: 'style' } },
        { name: 'replaceContent', arguments: { file: 'index.html', selector: '#target', newContent: 'Updated' } }
      ]
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles?.some(f => f.path === 'style.css')).toBe(true);
    expect(result.updatedFiles?.find(f => f.path === 'index.html')?.content).toContain('Updated');
  });

  test('replaceContent fails on missing selector', async () => {
    const result = await executeTool('replaceContent', {
      file: 'index.html',
      selector: '.does-not-exist',
      newContent: 'Nope'
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Selector not found/i);
  });

  test('replaceContent fails on non-html file', async () => {
    const result = await executeTool('replaceContent', {
      file: 'styles.css',
      selector: '.title',
      newContent: 'Updated'
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not supported/i);
  });

  test('updateStyle updates existing rule', async () => {
    const result = await executeTool('updateStyle', {
      selector: '.title',
      properties: { color: 'blue', 'font-weight': '700' }
    }, initialFiles);

    expect(result.message).not.toMatch(/error/i);
    expect(result.success).toBe(true);
    expect(result.updatedFiles?.[0].content).toMatch(/color:\s*blue/);
    expect(result.updatedFiles?.[0].content).toMatch(/font-weight:\s*700/);
    // Ensure the old 'color: red' is removed (not duplicated)
    expect(result.updatedFiles?.[0].content).not.toMatch(/color:\s*red/);
  });

  test('createFile rejects unsafe paths', async () => {
    const result = await executeTool('createFile', {
      path: '../secrets.txt',
      content: 'nope',
      fileType: 'page'
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid path/i);
  });
});
