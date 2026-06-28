import type { ProjectFile } from '@/lib/page-builder';
import type { HtmlFileManifest } from './types';

export function buildHtmlManifest(files: ProjectFile[]): HtmlFileManifest {
  const record: Record<string, ProjectFile> = {};
  for (const f of files) record[f.path] = f;

  const paths = files.map((f) => f.path).sort();
  const stylePaths = files.filter((f) => f.fileType === 'style' || f.path.endsWith('.css')).map((f) => f.path);
  const partialPaths = files.filter((f) => f.fileType === 'partial').map((f) => f.path);
  const pagePaths = files.filter((f) => f.fileType === 'page' || f.path.endsWith('.html')).map((f) => f.path);

  const entryPoint =
    paths.find((p) => p === 'index.html') ??
    pagePaths[0] ??
    paths[0] ??
    'index.html';

  return { entryPoint, paths, files: record, stylePaths, partialPaths, pagePaths };
}