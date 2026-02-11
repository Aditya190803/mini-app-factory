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

  test('replaceContent accepts oldContent that matches outer HTML', async () => {
    const result = await executeTool('replaceContent', {
      file: 'index.html',
      selector: 'body',
      oldContent: '<body>',
      newContent: '<main role="main">Updated</main>'
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles?.[0].content).toContain('role="main"');
  });

  test('replaceContent opening-tag updates attributes without nesting', async () => {
    const files: ProjectFile[] = [{
      path: 'index.html',
      content: '<html><body><main class="layout"><h1>Title</h1></main></body></html>',
      language: 'html',
      fileType: 'page'
    }];

    const result = await executeTool('replaceContent', {
      file: 'index.html',
      selector: 'main',
      oldContent: '<main>',
      newContent: '<main role="main">'
    }, files);

    expect(result.success).toBe(true);
    const html = result.updatedFiles?.[0].content || '';
    expect(html).toContain('<main class="layout" role="main">');
    expect(html).not.toContain('<main><main');
  });

  test('replaceContent updates CSS rule declarations', async () => {
    const result = await executeTool('replaceContent', {
      file: 'styles.css',
      selector: '.title',
      newContent: 'color: blue; font-size: 20px;'
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles?.[0].content).toMatch(/\.title\s*\{\s*color:\s*blue;?\s*font-size:\s*20px;?\s*\}/);
  });

  test('insertContent inserts CSS block before selector rule', async () => {
    const result = await executeTool('insertContent', {
      file: 'styles.css',
      selector: '.title',
      position: 'before',
      content: '.section-title { letter-spacing: 4px; }'
    }, initialFiles);

    expect(result.success).toBe(true);
    const css = result.updatedFiles?.[0].content || '';
    expect(css.indexOf('.section-title')).toBeGreaterThanOrEqual(0);
    expect(css.indexOf('.section-title')).toBeLessThan(css.indexOf('.title'));
  });

  test('deleteContent removes matching CSS rule', async () => {
    const result = await executeTool('deleteContent', {
      file: 'styles.css',
      selector: '.title',
    }, initialFiles);

    expect(result.success).toBe(true);
    expect(result.updatedFiles?.[0].content).not.toMatch(/\.title\s*\{/);
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

  test('rejects unknown tools', async () => {
    const result = await executeTool('runShellCommand', {
      command: 'rm -rf /'
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/tool not allowed/i);
  });

  test('batchEdit rejects malformed operation structures', async () => {
    const result = await executeTool('batchEdit', {
      operations: [
        { name: 'createFile', arguments: null },
      ]
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/invalid batch operation structure/i);
  });

  test('replaceContent surfaces CSS errors for empty declarations', async () => {
    const result = await executeTool('replaceContent', {
      file: 'styles.css',
      selector: '.title',
      newContent: ''
    }, initialFiles);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/css parse error/i);
  });
});
