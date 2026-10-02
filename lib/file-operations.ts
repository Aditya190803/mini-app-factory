import type { ProjectFile } from '@/lib/page-builder';

/**
 * Pure file-tree operations for the editor. Each returns the next file list, or an error message
 * for the user. Kept out of the component so the rules are tested rather than implied.
 */

export type FileOpResult = { ok: true; files: ProjectFile[]; renamed?: Map<string, string> } | { ok: false; error: string };

/** Files whose location is fixed by the runtime: Pages and Wrangler look for them by name. */
const PINNED_PATHS = new Set(['_worker.js', 'wrangler.jsonc', 'wrangler.json', 'index.html']);

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** A single path segment: no slashes, no `.` or `..`, nothing a URL or a zip would mangle. */
export function validateSegment(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.includes('/') || trimmed.includes('\\')) return 'Use a name, not a path. Move items by dragging them.';
  if (trimmed === '.' || trimmed === '..') return 'That name is reserved.';
  if (!SEGMENT.test(trimmed)) return 'Use letters, numbers, dots, hyphens and underscores.';
  if (trimmed.length > 100) return 'Names can be at most 100 characters.';
  return null;
}

/** A relative path of valid segments. */
export function validatePath(path: string): string | null {
  const parts = path.replace(/^\/+/, '').split('/');
  for (const part of parts) {
    const error = validateSegment(part);
    if (error) return error === 'Use a name, not a path. Move items by dragging them.' ? 'Invalid path.' : error;
  }
  return null;
}

const isFolderPath = (files: ProjectFile[], path: string) => files.some((file) => file.path.startsWith(`${path}/`));

export function languageForPath(path: string): ProjectFile['language'] {
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.json') || path.endsWith('.jsonc')) return 'json';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript';
  return 'html';
}

/**
 * Rename a file or folder in place. Rejects names that collide with an existing file or folder:
 * the old version silently merged two folders' contents, and renaming `_worker.js` quietly broke
 * the deploy.
 */
export function renameItem(files: ProjectFile[], oldPath: string, newName: string): FileOpResult {
  const nameError = validateSegment(newName);
  if (nameError) return { ok: false, error: nameError };
  const folder = isFolderPath(files, oldPath);
  if (!folder && PINNED_PATHS.has(oldPath)) {
    return { ok: false, error: `${oldPath} has to keep its name: the runtime looks for it by that path.` };
  }
  const parent = oldPath.includes('/') ? oldPath.slice(0, oldPath.lastIndexOf('/') + 1) : '';
  const newPath = `${parent}${newName.trim()}`;
  if (newPath === oldPath) return { ok: true, files, renamed: new Map() };
  if (files.some((file) => file.path === newPath) || isFolderPath(files, newPath)) {
    return { ok: false, error: `Something named ${newName.trim()} already exists here.` };
  }

  const renamed = new Map<string, string>();
  const next = files.map((file) => {
    if (!folder && file.path === oldPath) {
      renamed.set(file.path, newPath);
      return { ...file, path: newPath, language: languageForPath(newPath) };
    }
    if (folder && file.path.startsWith(`${oldPath}/`)) {
      const moved = `${newPath}/${file.path.slice(oldPath.length + 1)}`;
      renamed.set(file.path, moved);
      return { ...file, path: moved };
    }
    return file;
  });
  return { ok: true, files: next, renamed };
}

/** Move a file or folder into another folder ('' is the root). */
export function moveItem(files: ProjectFile[], sourcePath: string, destinationFolder: string): FileOpResult {
  const folder = isFolderPath(files, sourcePath);
  if (!folder && PINNED_PATHS.has(sourcePath)) {
    return { ok: false, error: `${sourcePath} has to stay at the project root.` };
  }
  const dest = destinationFolder.replace(/\/+$/, '');
  if (folder && (dest === sourcePath || dest.startsWith(`${sourcePath}/`))) {
    return { ok: false, error: 'A folder cannot be moved into itself.' };
  }
  const name = sourcePath.split('/').pop()!;
  const newPath = dest ? `${dest}/${name}` : name;
  if (newPath === sourcePath) return { ok: true, files, renamed: new Map() };
  if (files.some((file) => file.path === newPath) || isFolderPath(files, newPath)) {
    return { ok: false, error: `An item named ${name} already exists in ${dest || 'the root'}.` };
  }
  const renamed = new Map<string, string>();
  const next = files.map((file) => {
    if (file.path === sourcePath || file.path.startsWith(`${sourcePath}/`)) {
      const moved = `${newPath}${file.path.slice(sourcePath.length)}`;
      renamed.set(file.path, moved);
      return { ...file, path: moved };
    }
    return file;
  });
  return { ok: true, files: next, renamed };
}

export function deleteItem(files: ProjectFile[], path: string, type: 'file' | 'folder'): ProjectFile[] {
  if (type === 'file') return files.filter((file) => file.path !== path);
  const prefix = path.endsWith('/') ? path : `${path}/`;
  return files.filter((file) => !file.path.startsWith(prefix));
}

export function duplicateItem(files: ProjectFile[], path: string): { files: ProjectFile[]; path: string } | null {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) return null;
  const slash = path.lastIndexOf('/');
  const parent = slash >= 0 ? path.slice(0, slash + 1) : '';
  const fileName = path.slice(slash + 1);
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let counter = 1;
  let newPath = `${parent}${base}_copy${counter}${ext}`;
  while (files.some((candidate) => candidate.path === newPath)) newPath = `${parent}${base}_copy${++counter}${ext}`;
  return { files: [...files, { ...file, path: newPath }], path: newPath };
}

export function reorderItem(files: ProjectFile[], sourcePath: string, beforePath: string): ProjectFile[] {
  const next = [...files];
  const from = next.findIndex((file) => file.path === sourcePath);
  const to = next.findIndex((file) => file.path === beforePath);
  if (from === -1 || to === -1) return files;
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  return next;
}
