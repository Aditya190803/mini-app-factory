import type { ProjectFile } from '@/lib/page-builder';
import type { TransformCompletePayload } from '@/lib/transform-stream';

function applyFileDelta(
  currentFiles: ProjectFile[],
  updates: ProjectFile[],
  deletedPaths: string[] = []
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

export function getTransformRecoverySuggestion(code: string) {
  if (code === 'INVALID_TOOL_CALL') {
    return 'Use a smaller change request, target a specific element, and avoid asking for many edits at once.';
  }
  if (code === 'RATE_LIMITED') {
    return 'Wait a few seconds, then retry. Batch multiple tiny edits into a single transform.';
  }
  if (code === 'INVALID_FILE_STRUCTURE') {
    return 'Restore required files (for example index.html) and retry.';
  }
  if (code === 'CONFLICT') {
    return 'Your files changed while the AI was working. Your edits are kept; send the request again.';
  }
  if (code === 'QUOTA_EXCEEDED') {
    return 'Add your own API key in Settings to keep building now, or wait for the allowance to reset.';
  }
  if (code === 'SAVE_FAILED') {
    return 'Server could not persist files. Retry; if it persists, check Convex connectivity.';
  }
  if (code === 'ABORTED') {
    return 'Request was cancelled. Your prompt was put back — edit and send again.';
  }
  if (code === 'TIMEOUT') {
    return 'The model took too long. Retry with a smaller change, or switch models.';
  }
  if (code === 'UNAUTHORIZED') {
    return 'Sign in again, reload the editor, and retry.';
  }
  if (code === 'PROJECT_NOT_FOUND') {
    return 'Return to dashboard, reopen the project, then retry.';
  }
  return 'Check your prompt, reduce scope, and retry. You can also apply part of the change manually, then run transform again.';
}

/**
 * Apply a finished transform to the editor state. Returns the resulting files, or null when the
 * result carried nothing to apply.
 *
 * The server has already saved the result (and reports the new `filesVersion`), so this does not
 * save again. It used to call persistFiles, whose write carried the pre-transform version and was
 * rejected — every successful build ended in a false "someone else saved" conflict and autosave
 * stopped. `onApplied` hands the files and version to the editor to adopt as its saved baseline.
 */
export function applyTransformComplete(
  result: TransformCompletePayload,
  files: ProjectFile[],
  setFiles: (f: ProjectFile[]) => void,
  addToHistory: (f: ProjectFile[]) => void,
  onApplied: (f: ProjectFile[], filesVersion?: number) => void
): ProjectFile[] | null {
  let nextFiles: ProjectFile[];
  if (result.full) {
    nextFiles = Array.isArray(result.files) ? result.files : [];
    if (nextFiles.length === 0) return null;
  } else if (Array.isArray(result.files)) {
    nextFiles = applyFileDelta(files, result.files, result.deletedPaths || []);
  } else {
    return null;
  }
  setFiles(nextFiles);
  addToHistory(nextFiles);
  onApplied(nextFiles, result.filesVersion);
  return nextFiles;
}