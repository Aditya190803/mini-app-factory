import type { ProjectFile } from '@/lib/page-builder';

export function fileTypeFromPath(path: string): ProjectFile['fileType'] {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith('.css')) return 'style';
  if (lowerPath.endsWith('.js')) return 'script';
  return 'page';
}

export function normalizeFileType(raw: unknown, path: string): ProjectFile['fileType'] {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'html') return 'page';
  if (value === 'css') return 'style';
  if (value === 'js' || value === 'javascript') return 'script';
  if (value === 'page' || value === 'partial' || value === 'style' || value === 'script') {
    return value as ProjectFile['fileType'];
  }
  if (path) return fileTypeFromPath(path);
  return 'page';
}