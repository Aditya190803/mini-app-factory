import { describe, test, expect } from 'vitest';
import { assembleFullPage, resolveIncludes, ProjectFile } from '@/lib/page-builder';

describe('page-builder', () => {
  const mockFiles: ProjectFile[] = [
    {
      path: 'index.html',
      content: '<html><head></head><body><!-- include:header.html --><main>Content</main></body></html>',
      language: 'html',
      fileType: 'page'
    },
    {
      path: 'header.html',
      content: '<header>My Header</header>',
      language: 'html',
      fileType: 'partial'
    },
    {
      path: 'styles.css',
      content: 'body { color: red; }',
      language: 'css',
      fileType: 'style'
    },
    {
      path: 'script.js',
      content: 'console.log("hi");',
      language: 'javascript',
      fileType: 'script'
    }
  ];

  test('resolveIncludes recursively resolves partials', () => {
    const html = '<div><!-- include:header.html --></div>';
    const result = resolveIncludes(html, mockFiles);
    expect(result).toBe('<div><header>My Header</header></div>');
  });

  test('assembleFullPage inlines styles and scripts', () => {
    const result = assembleFullPage('index.html', mockFiles);
    expect(result).toContain('<header>My Header</header>');
    expect(result).toContain('<style data-file="styles.css">');
    expect(result).toContain('body { color: red; }');
    expect(result).toContain('<script data-file="script.js">');
    expect(result).toContain('console.log("hi");');
  });

  test('assembleFullPage injects base href when projectName is provided', () => {
    const result = assembleFullPage('index.html', mockFiles, 'my-project');
    expect(result).toContain('<base href="/results/my-project/">');
  });

  test('assembleFullPage handles missing head by creating one for base tag', () => {
    const filesNoHead: ProjectFile[] = [{
      path: 'index.html',
      content: '<body>Hello</body>',
      language: 'html',
      fileType: 'page'
    }];
    const result = assembleFullPage('index.html', filesNoHead, 'my-project');
    expect(result).toContain('<head><base href="/results/my-project/"></head>');
  });
  test('assembleFullPage gives a bare fragment a document, so styles and scripts still land', () => {
    const html = assembleFullPage('index.html', [
      { path: 'index.html', content: '<main>Fragment</main>', language: 'html', fileType: 'page' },
      { path: 'styles.css', content: 'main { color: red; }', language: 'css', fileType: 'style' },
    ], 'demo', undefined, true);
    expect(html).toMatch(/<head>[\s\S]*main \{ color: red; \}[\s\S]*<\/head>/);
    expect(html).toContain('<main>Fragment</main>');
    expect(html).toContain('id="preview-bridge"');
  });
});
