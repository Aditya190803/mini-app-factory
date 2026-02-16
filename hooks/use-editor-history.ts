import { useState, useCallback, useRef } from 'react';
import type { ProjectFile } from '@/lib/page-builder';
import { MAX_HISTORY_ENTRIES } from '@/lib/constants';

/**
 * Manages undo/redo history for the editor file state.
 * Extracted from EditorWorkspace to reduce component complexity.
 */
export function useEditorHistory() {
  const [history, setHistory] = useState<ProjectFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const addToHistory = useCallback((snapshot: ProjectFile[]) => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const next = [...trimmed, snapshot];
      if (next.length > MAX_HISTORY_ENTRIES) {
        next.shift();
        return next;
      }
      return next;
    });
    setHistoryIndex((prev) => {
      const capped = Math.min(prev + 1, MAX_HISTORY_ENTRIES - 1);
      return capped;
    });
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevFiles = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      return prevFiles;
    }
    return null;
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextFiles = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      return nextFiles;
    }
    return null;
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  /** Initialise history with a first snapshot (e.g. after loading from DB). */
  const initHistory = useCallback((initial: ProjectFile[]) => {
    setHistory([initial]);
    setHistoryIndex(0);
  }, []);

  /** Reset to the very first snapshot. */
  const resetToInitial = useCallback(() => {
    if (history.length > 0) {
      setHistoryIndex(0);
      return history[0];
    }
    return null;
  }, [history]);

  /** Schedule a history snapshot after a debounce period. */
  const scheduleSnapshot = useCallback((snapshot: ProjectFile[], delayMs = 1000) => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      addToHistory(snapshot);
    }, delayMs);
  }, [addToHistory]);

  /** Cancel any pending debounced snapshot. */
  const cancelPendingSnapshot = useCallback(() => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
  }, []);

  return {
    history,
    historyIndex,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    initHistory,
    resetToInitial,
    scheduleSnapshot,
    cancelPendingSnapshot,
  };
}
