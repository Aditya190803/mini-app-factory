import { describe, expect, it } from 'vitest';
import { deleteItem, duplicateItem, moveItem, renameItem, reorderItem, validatePath } from '@/lib/file-operations';
import type { ProjectFile } from '@/lib/page-builder';

const file = (path: string, fileType: ProjectFile['fileType'] = 'page'): ProjectFile => ({ path, content: path, language: 'html', fileType });
const paths = (files: ProjectFile[]) => files.map((f) => f.path).sort();

const project = [
  file('index.html'),
  file('_worker.js', 'worker'),
  file('about.html'),
  file('pages/a.html'),
  file('pages/b.html'),
  file('docs/a.html'),
];

describe('renameItem', () => {
  it('renames a file and updates its language', () => {
    const result = renameItem(project, 'about.html', 'about.css');
    expect(result.ok && result.files.find((f) => f.path === 'about.css')?.language).toBe('css');
  });

  it('renames a folder and everything in it', () => {
    const result = renameItem(project, 'pages', 'views');
    expect(result.ok && paths(result.files)).toContain('views/b.html');
    expect(result.ok && result.renamed?.get('pages/a.html')).toBe('views/a.html');
  });

  it('refuses to merge into an existing folder', () => {
    expect(renameItem(project, 'pages', 'docs')).toMatchObject({ ok: false });
  });

  it('refuses to rename files the runtime looks up by name', () => {
    expect(renameItem(project, '_worker.js', 'worker.js')).toMatchObject({ ok: false });
  });

  it.each(['', 'a/b', '..', 'bad name', 'x%y'])('rejects the name %j', (name) => {
    expect(renameItem(project, 'about.html', name)).toMatchObject({ ok: false });
  });
});

describe('moveItem', () => {
  it('moves a file into a folder', () => {
    const result = moveItem(project, 'about.html', 'docs');
    expect(result.ok && paths(result.files)).toContain('docs/about.html');
  });

  it('refuses to move a folder into itself', () => {
    expect(moveItem(project, 'pages', 'pages/sub')).toMatchObject({ ok: false });
  });

  it('refuses a move that would overwrite', () => {
    expect(moveItem(project, 'pages/a.html', 'docs')).toMatchObject({ ok: false });
  });
});

describe('other operations', () => {
  it('deletes a folder and its contents only', () => {
    expect(paths(deleteItem(project, 'pages', 'folder'))).toEqual(['_worker.js', 'about.html', 'docs/a.html', 'index.html']);
  });

  it('duplicates with a free name', () => {
    const once = duplicateItem(project, 'about.html')!;
    const twice = duplicateItem(once.files, 'about.html')!;
    expect([once.path, twice.path]).toEqual(['about_copy1.html', 'about_copy2.html']);
  });

  it('reorders without losing files', () => {
    expect(reorderItem(project, 'docs/a.html', 'index.html')[0]!.path).toBe('docs/a.html');
  });

  it('validates multi-segment paths', () => {
    expect(validatePath('migrations/0001_init.sql')).toBeNull();
    expect(validatePath('migrations/../x.sql')).not.toBeNull();
  });
});
