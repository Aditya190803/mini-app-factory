import { describe, expect, it } from 'vitest';
import type { ProjectFile } from '@/lib/page-builder';
import { buildHtmlManifest } from '@/lib/edit-intent/manifest';
import { analyzeHtmlEditIntent } from '@/lib/edit-intent/analyze';
import { selectFilesForHtmlEdit } from '@/lib/edit-intent/context';
import { EditType } from '@/lib/edit-intent/types';

const sampleFiles: ProjectFile[] = [
  { path: 'index.html', content: '<html><body><h1>Welcome</h1><!-- include:header.html --></body></html>', language: 'html', fileType: 'page' },
  { path: 'header.html', content: '<header><nav>Home</nav></header>', language: 'html', fileType: 'partial' },
  { path: 'styles.css', content: 'body { color: #111; }', language: 'css', fileType: 'style' },
];

describe('edit-intent', () => {
  it('builds manifest with entry index.html', () => {
    const m = buildHtmlManifest(sampleFiles);
    expect(m.entryPoint).toBe('index.html');
    expect(m.partialPaths).toContain('header.html');
    expect(m.stylePaths).toContain('styles.css');
  });

  it('routes style prompts to css', () => {
    const m = buildHtmlManifest(sampleFiles);
    const intent = analyzeHtmlEditIntent('make it dark mode and update the theme colors', m);
    expect(intent.type).toBe(EditType.UPDATE_STYLE);
    expect(intent.targetFiles).toContain('styles.css');
  });

  it('routes header mention to header partial', () => {
    const m = buildHtmlManifest(sampleFiles);
    const intent = analyzeHtmlEditIntent('update the header navigation', m);
    expect(intent.targetFiles.some((p) => p.includes('header'))).toBe(true);
  });

  it('finds content by quoted text', () => {
    const m = buildHtmlManifest(sampleFiles);
    const intent = analyzeHtmlEditIntent('remove the "Welcome" text', m);
    expect(intent.targetFiles).toContain('index.html');
  });

  it('prioritizes target element path in selection', () => {
    const sel = selectFilesForHtmlEdit('change colors', sampleFiles, {
      targetElementPath: 'header.html',
    });
    expect(sel.primaryFiles[0]).toBe('header.html');
    expect(sel.focusPath).toBe('header.html');
  });

  it('add page intent includes entry and partials', () => {
    const m = buildHtmlManifest(sampleFiles);
    const intent = analyzeHtmlEditIntent('add a new about page to the site', m);
    expect(intent.type).toBe(EditType.ADD_FEATURE);
    expect(intent.targetFiles).toContain('index.html');
  });
});