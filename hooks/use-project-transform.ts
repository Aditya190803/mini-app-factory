'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';
import { withAIAdminHeaders } from '@/lib/ai-admin-client';
import { consumeTransformStream } from '@/lib/transform-stream';
import { transformEventToProgress, type TransformProgressState } from '@/components/editor/transform-progress';
import {
  applyTransformComplete,
  getTransformRecoverySuggestion,
} from '@/lib/editor-apply-transform';

export type RunTransformBody = {
  projectName: string;
  activeFile: string;
  prompt?: string;
  polishDescription?: string;
  modelId?: string;
  providerId?: string;
};

type UseProjectTransformArgs = {
  projectName: string;
  activeFilePath: string;
  files: ProjectFile[];
  setFiles: (f: ProjectFile[]) => void;
  addToHistory: (f: ProjectFile[]) => void;
  persistFiles: (f: ProjectFile[]) => void;
  selectedModel: { id: string; providerId: string };
  transformPrompt: string;
  setTransformPrompt: (v: string) => void;
  selectedElement: { path: string; html: string; selector?: string } | null;
  setSelectedElement: (v: null) => void;
};

export function useProjectTransform(args: UseProjectTransformArgs) {
  const {
    projectName,
    activeFilePath,
    files,
    setFiles,
    addToHistory,
    persistFiles,
    selectedModel,
    transformPrompt,
    setTransformPrompt,
    selectedElement,
    setSelectedElement,
  } = args;

  const [isTransforming, setIsTransforming] = useState(false);
  const [transformProgress, setTransformProgress] = useState<TransformProgressState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelTransform = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const postTransform = useCallback(
    async (body: RunTransformBody) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setIsTransforming(true);
      setTransformProgress(null);
      try {
        const response = await fetch('/api/transform', {
          method: 'POST',
          headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
          signal: ac.signal,
        });

        const result = await consumeTransformStream(response, (event) => {
          const next = transformEventToProgress(event);
          if (next) setTransformProgress(next);
        });

        applyTransformComplete(result, files, setFiles, addToHistory, persistFiles);
        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }
        const code =
          err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : 'TRANSFORM_ERROR';
        const message = err instanceof Error ? err.message : 'Transform failed';
        const requestId =
          err && typeof err === 'object' && 'requestId' in err
            ? String((err as { requestId: string }).requestId)
            : undefined;
        const suggestion = getTransformRecoverySuggestion(code);
        toast.error(message, { description: requestId ? `${suggestion} (request: ${requestId})` : suggestion });
        throw err;
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setIsTransforming(false);
        setTransformProgress(null);
      }
    },
    [files, setFiles, addToHistory, persistFiles]
  );

  const runTransform = useCallback(async () => {
    if (!transformPrompt.trim()) return;
    let finalPrompt = transformPrompt;
    if (selectedElement) {
      const cleanHtml = selectedElement.html
        .replace(/ data-source-file="[^"]*"/g, '')
        .replace(/ style="display: contents;"/g, '');
      const selectorLine = selectedElement.selector ? `CSS selector: ${selectedElement.selector}\n` : '';
      finalPrompt = `Target element in ${selectedElement.path}:\n${selectorLine}${cleanHtml}\n\nInstructions: ${transformPrompt}`;
    }
    try {
      await postTransform({
        projectName,
        activeFile: activeFilePath,
        prompt: finalPrompt,
        modelId: selectedModel.id || undefined,
        providerId: selectedModel.providerId || undefined,
      });
      setTransformPrompt('');
      setSelectedElement(null);
    } catch {
      /* toast handled in postTransform */
    }
  }, [
    transformPrompt,
    selectedElement,
    postTransform,
    projectName,
    activeFilePath,
    selectedModel,
    setTransformPrompt,
    setSelectedElement,
  ]);

  const runPolish = useCallback(
    async (polishDescription: string) => {
      try {
        await postTransform({ projectName, activeFile: activeFilePath, polishDescription });
      } catch {
        /* toast in postTransform */
      }
    },
    [postTransform, projectName, activeFilePath]
  );

  return {
    isTransforming,
    transformProgress,
    runTransform,
    runPolish,
    cancelTransform,
  };
}