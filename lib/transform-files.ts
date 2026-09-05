import type { ProjectFile } from '@/lib/page-builder';

export function fileTypeFromPath(path: string): ProjectFile['fileType'] {
  const lowerPath = path.toLowerCase();
  if (['cloudflare.json', 'wrangler.jsonc', 'wrangler.json', 'package.json', 'tsconfig.json', 'readme.md', '.dev.vars.example', '.gitignore'].includes(lowerPath)) return 'config';
  if (lowerPath === '_worker.js' || lowerPath.startsWith('src/') || lowerPath.startsWith('workers/')) return 'worker';
  if (lowerPath.startsWith('migrations/') && lowerPath.endsWith('.sql')) return 'migration';
  if (lowerPath.endsWith('.css')) return 'style';
  if (lowerPath.endsWith('.js')) return 'script';
  return 'page';
}

export function normalizeFileType(raw: unknown, path: string): ProjectFile['fileType'] {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'html') return 'page';
  if (value === 'css') return 'style';
  if (value === 'js' || value === 'javascript') return path === '_worker.js' ? 'worker' : 'script';
  if (value === 'sql') return 'migration';
  if (value === 'json') return 'config';
  if (
    value === 'page' || value === 'partial' || value === 'style' || value === 'script' ||
    value === 'worker' || value === 'migration' || value === 'config'
  ) {
    return value as ProjectFile['fileType'];
  }
  if (path) return fileTypeFromPath(path);
  return 'page';
}
