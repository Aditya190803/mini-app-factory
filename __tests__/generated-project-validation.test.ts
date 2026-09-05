import { describe, expect, test } from 'vitest';
import { findMigrationDrift, validateGeneratedProject } from '@/lib/generated-project-validation';
import type { ProjectFile } from '@/lib/page-builder';

const file = (path: string, content: string, fileType: ProjectFile['fileType'], language: ProjectFile['language']): ProjectFile => ({ path, content, fileType, language });

describe('generated project validation', () => {
  test('accepts a portable Worker and D1 project', () => {
    const files: ProjectFile[] = [
      file('index.html', '<script src="script.js"></script>', 'page', 'html'),
      file('styles.css', 'body { color: #111; }', 'style', 'css'),
      file('script.js', "fetch('/api/tasks')", 'script', 'javascript'),
      file('_worker.js', "export default { async fetch(request, env) { const u = new URL(request.url); if (u.pathname === '/api/health') return Response.json({ok:true}); if (u.pathname === '/api/tasks') return Response.json([]); return env.ASSETS.fetch(request); } }", 'worker', 'javascript'),
      file('wrangler.jsonc', '{"name":"demo","main":"_worker.js","compatibility_date":"2026-08-09","d1_databases":[{"binding":"DB","database_name":"demo-db","migrations_dir":"migrations"}]}', 'config', 'json'),
      file('package.json', '{"scripts":{"dev":"wrangler dev"},"devDependencies":{"wrangler":"4.30.0"}}', 'config', 'json'),
      file('README.md', '# Demo', 'config', 'html'),
      file('migrations/0001_init.sql', 'CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY);', 'migration', 'sql'),
    ];
    expect(validateGeneratedProject(files, 'demo')).toEqual({ valid: true, errors: [], warnings: [] });
  });

  test('rejects secrets, destructive SQL, unpinned dependencies, and missing routes', () => {
    const files: ProjectFile[] = [
      file('index.html', '<script src="script.js"></script>', 'page', 'html'),
      file('styles.css', '', 'style', 'css'),
      file('script.js', "fetch('/api/missing')", 'script', 'javascript'),
      file('_worker.js', "const API_KEY='abcdefghijklmnop'; export default { fetch(request, env) { if (new URL(request.url).pathname === '/api/health') return Response.json({}); return env.ASSETS.fetch(request); }}", 'worker', 'javascript'),
      file('wrangler.jsonc', '{"name":"demo","main":"_worker.js"}', 'config', 'json'),
      file('package.json', '{"devDependencies":{"wrangler":"latest"}}', 'config', 'json'),
      file('migrations/0001.sql', 'DROP TABLE users;', 'migration', 'sql'),
    ];
    const result = validateGeneratedProject(files, 'demo');
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/embedded secret|Destructive SQL|pinned versions|missing Worker route/i);
  });

  test('prevents deleting or rewriting saved migrations', () => {
    const original = [file('migrations/0001.sql', 'CREATE TABLE users(id TEXT);', 'migration', 'sql')];
    expect(findMigrationDrift(original, [])).toEqual(['Previously saved migration cannot be deleted: migrations/0001.sql']);
    expect(findMigrationDrift(original, [file('migrations/0001.sql', 'CREATE TABLE accounts(id TEXT);', 'migration', 'sql')])).toEqual([
      'Previously saved migration cannot be modified: migrations/0001.sql',
    ]);
  });
});
