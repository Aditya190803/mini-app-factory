import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';
import type { TransformCompletePayload } from '@/lib/transform-stream';

export function applyFileDelta(
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
  if (code === 'SAVE_FAILED') {
    return 'Server could not persist files. Retry; if it persists, check Convex connectivity.';
  }
  if (code === 'ABORTED') {
    return 'Request was cancelled.';
  }
  if (code === 'UNAUTHORIZED') {
    return 'Sign in again, reload the editor, and retry.';
  }
  if (code === 'PROJECT_NOT_FOUND') {
    return 'Return to dashboard, reopen the project, then retry.';
  }
  return 'Check your prompt, reduce scope, and retry. You can also apply part of the change manually, then run transform again.';
}

export function applyTransformComplete(
  result: TransformCompletePayload,
  files: ProjectFile[],
  setFiles: (f: ProjectFile[]) => void,
  addToHistory: (f: ProjectFile[]) => void,
  persistFiles: (f: ProjectFile[]) => void
) {
  if (result.full) {
    const fullFiles = Array.isArray(result.files) ? result.files : [];
    if (fullFiles.length === 0) {
      toast.error('Transform returned no files', {
        description: 'The server indicated a full replacement but provided no files.',
      });
      return;
    }
    setFiles(fullFiles);
    addToHistory(fullFiles);
    persistFiles(fullFiles);
    return;
  }
  if (Array.isArray(result.files)) {
    const nextFiles = applyFileDelta(files, result.files, result.deletedPaths || []);
    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);
  }
}