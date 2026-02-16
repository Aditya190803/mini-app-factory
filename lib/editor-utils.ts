import type { ProjectFile } from '@/lib/page-builder';

/**
 * Applies a delta (updated files + deleted paths) to the current file list.
 */
export function applyFileDelta(
  currentFiles: ProjectFile[],
  updates: ProjectFile[],
  deletedPaths: string[] = [],
): ProjectFile[] {
  const map = new Map(currentFiles.map((file) => [file.path, file]));
  for (const file of updates) {
    map.set(file.path, file);
  }
  for (const path of deletedPaths) {
    map.delete(path);
  }
  return Array.from(map.values());
}

/**
 * Returns a user-facing recovery suggestion for a given transform error code.
 */
export function getTransformRecoverySuggestion(code: string): string {
  if (code === 'INVALID_TOOL_CALL') {
    return 'Use a smaller change request, target a specific element, and avoid asking for many edits at once.';
  }
  if (code === 'RATE_LIMITED') {
    return 'Wait a few seconds, then retry. Batch multiple tiny edits into a single transform.';
  }
  if (code === 'INVALID_FILE_STRUCTURE') {
    return 'Restore required files (for example index.html) and retry.';
  }
  if (code === 'UNAUTHORIZED') {
    return 'Sign in again, reload the editor, and retry.';
  }
  if (code === 'PROJECT_NOT_FOUND') {
    return 'Return to dashboard, reopen the project, then retry.';
  }
  return 'Check your prompt, reduce scope, and retry. You can also apply part of the change manually, then run transform again.';
}
