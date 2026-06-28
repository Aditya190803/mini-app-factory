import type { ProjectFile } from '@/lib/page-builder';
import { buildHtmlManifest } from './manifest';
import { analyzeHtmlEditIntent } from './analyze';
import type { HtmlEditIntent, HtmlFileSelection } from './types';

const KEY_CONTEXT = (paths: string[]) => {
  const key: string[] = [];
  if (paths.includes('index.html')) key.push('index.html');
  for (const p of paths) {
    if (/header\.html$/i.test(p)) key.push(p);
    if (/footer\.html$/i.test(p)) key.push(p);
    if (/styles?\.css$/i.test(p) || p.endsWith('.css')) key.push(p);
  }
  return [...new Set(key)];
};

export function selectFilesForHtmlEdit(
  prompt: string,
  files: ProjectFile[],
  options?: { activeFile?: string; targetElementPath?: string }
): HtmlFileSelection {
  const manifest = buildHtmlManifest(files);
  const editIntent = analyzeHtmlEditIntent(prompt, manifest);

  let primaryFiles = [...editIntent.targetFiles];
  if (options?.targetElementPath && files.some((f) => f.path === options.targetElementPath)) {
    primaryFiles = unique([options.targetElementPath, ...primaryFiles]);
  } else if (options?.activeFile && files.some((f) => f.path === options.activeFile)) {
    primaryFiles = unique([options.activeFile, ...primaryFiles]);
  }

  const primarySet = new Set(primaryFiles);
  const contextFiles = unique([
    ...KEY_CONTEXT(manifest.paths),
    ...manifest.partialPaths,
    ...manifest.stylePaths,
    ...manifest.paths,
  ]).filter((p) => !primarySet.has(p));

  const focusPath =
    options?.targetElementPath ??
    options?.activeFile ??
    primaryFiles[0] ??
    manifest.entryPoint;

  return { primaryFiles, contextFiles, editIntent, focusPath };
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

export function formatIntentForPrompt(intent: HtmlEditIntent, primaryFiles: string[]): string {
  return [
    '## Edit focus (heuristic)',
    `Type: ${intent.type}`,
    `Summary: ${intent.description}`,
    `Priority files: ${primaryFiles.join(', ')}`,
    'Apply changes primarily to priority files; keep other project files consistent (links, includes, shared classes).',
  ].join('\n');
}

function fileBlock(file: ProjectFile, tag: string): string {
  return `File: ${file.path} ${tag}\n\`\`\`${file.language}\n${file.content}\n\`\`\``;
}

function truncateBlock(block: string, maxLen: number): string {
  if (block.length <= maxLen) return block;
  const suffix = '\n```\n[content truncated for context budget]';
  const keep = Math.max(80, maxLen - suffix.length);
  return `${block.slice(0, keep)}${suffix}`;
}

export function buildProjectContextWithIntent(
  files: ProjectFile[],
  selection: HtmlFileSelection,
  maxChars: number
): string {
  const order = (path: string) => {
    const pi = selection.primaryFiles.indexOf(path);
    if (pi >= 0) return pi;
    const ci = selection.contextFiles.indexOf(path);
    if (ci >= 0) return 100 + ci;
    return 200;
  };

  const prioritized = [...files].sort((a, b) => order(a.path) - order(b.path) || a.path.localeCompare(b.path));
  const header = `Project Files: ${files.map((f) => f.path).join(', ')}`;
  const omitted: string[] = [];
  const included: string[] = [];
  let total = header.length + 4;

  const tryAdd = (block: string, path: string, force: boolean) => {
    let b = block;
    if (total + b.length > maxChars) {
      if (!force) {
        omitted.push(path);
        return;
      }
      const room = maxChars - total - 4;
      if (room < 80) {
        omitted.push(path);
        return;
      }
      b = truncateBlock(block, room);
    }
    included.push(b);
    total += b.length + 2;
  };

  for (const file of prioritized) {
    const isPrimary = selection.primaryFiles.includes(file.path);
    const tag = isPrimary ? '[priority]' : '';
    tryAdd(fileBlock(file, tag), file.path, isPrimary);
  }

  const omittedNote = omitted.length > 0 ? `\n\n[Context Budget] Omitted files: ${omitted.join(', ')}` : '';
  let out = `${header}\n\n${included.join('\n\n')}${omittedNote}`.trim();
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 20)}\n[truncated]`;
  }
  return out;
}