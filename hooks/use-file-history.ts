'use client';

import { useCallback, useRef, useState } from 'react';
import type { ProjectFile } from '@/lib/page-builder';

const MAX_ENTRIES = 50;

/**
 * Undo/redo snapshots of the editor's files.
 *
 * The stack lives in a ref and the component re-renders through a counter. The previous version
 * kept the index in state and read it inside a memoised `addToHistory`, so callers holding an
 * older copy pushed onto the wrong position and redo history was lost or duplicated.
 */
export function useFileHistory(setFiles: (files: ProjectFile[]) => void) {
  const stack = useRef<ProjectFile[][]>([]);
  const index = useRef(-1);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((value) => value + 1), []);

  /** Start over from `files`, e.g. after loading or restoring a version. */
  const resetHistory = useCallback((files: ProjectFile[]) => {
    stack.current = [files];
    index.current = 0;
    bump();
  }, [bump]);

  const addToHistory = useCallback((files: ProjectFile[]) => {
    const next = stack.current.slice(0, index.current + 1);
    next.push(files);
    while (next.length > MAX_ENTRIES) next.shift();
    stack.current = next;
    index.current = next.length - 1;
    bump();
  }, [bump]);

  const undo = useCallback(() => {
    if (index.current <= 0) return;
    index.current -= 1;
    setFiles(stack.current[index.current]!);
    bump();
  }, [bump, setFiles]);

  const redo = useCallback(() => {
    if (index.current >= stack.current.length - 1) return;
    index.current += 1;
    setFiles(stack.current[index.current]!);
    bump();
  }, [bump, setFiles]);

  return {
    addToHistory,
    resetHistory,
    undo,
    redo,
    canUndo: index.current > 0,
    canRedo: index.current < stack.current.length - 1,
  };
}
