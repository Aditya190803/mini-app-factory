import type { ProjectFile } from '@/lib/page-builder';

const supported: Record<string, Pick<ProjectFile, 'language' | 'fileType'>> = {
  html: { language: 'html', fileType: 'page' },
  css: { language: 'css', fileType: 'style' },
  js: { language: 'javascript', fileType: 'script' },
  mjs: { language: 'javascript', fileType: 'script' },
  sql: { language: 'sql', fileType: 'migration' },
  json: { language: 'json', fileType: 'config' },
  jsonc: { language: 'json', fileType: 'config' },
};

export function classifyGitHubFile(path: string): Pick<ProjectFile, 'language' | 'fileType'> | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..')) return null;
  const extension = normalized.split('.').pop()?.toLowerCase() || '';
  const base = supported[extension];
  if (!base) return null;
  if (normalized === '_worker.js' || normalized.startsWith('workers/')) return { language: 'javascript', fileType: 'worker' };
  if (/^migrations\/.*\.sql$/i.test(normalized)) return { language: 'sql', fileType: 'migration' };
  if (/wrangler\.jsonc?$/i.test(normalized)) return { language: 'json', fileType: 'config' };
  if (extension === 'html' && normalized.includes('/partials/')) return { language: 'html', fileType: 'partial' };
  return base;
}

export function diffProjectFiles(local: Array<Pick<ProjectFile, 'path' | 'content'>>, remote: Array<Pick<ProjectFile, 'path' | 'content'>>) {
  const localMap = new Map(local.map((file) => [file.path, file.content]));
  const remoteMap = new Map(remote.map((file) => [file.path, file.content]));
  return {
    added: remote.filter((file) => !localMap.has(file.path)).map((file) => file.path),
    changed: remote.filter((file) => localMap.has(file.path) && localMap.get(file.path) !== file.content).map((file) => file.path),
    removed: local.filter((file) => !remoteMap.has(file.path)).map((file) => file.path),
  };
}
