'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';
import { withAIAdminHeaders } from '@/lib/ai-admin-client';
import { consumeTransformStream, type TransformStreamEvent } from '@/lib/transform-stream';
import { transformEventToProgress, type TransformProgressState } from '@/components/editor/transform-progress';
import {
  applyTransformComplete,
  getTransformRecoverySuggestion,
} from '@/lib/editor-apply-transform';

export type RunTransformBody = {
  projectName: string;
  activeFile: string;
  prompt?: string;
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
  onRunStarted?: (prompt: string) => void | Promise<void>;
  onRunCompleted?: (prompt: string, files: ProjectFile[]) => void | Promise<void>;
  onRunFailed?: (prompt: string, message: string) => void | Promise<void>;
  onRunEvent?: (event: TransformStreamEvent) => void | Promise<void>;
  onRunCancelled?: () => void | Promise<void>;
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
    onRunStarted,
    onRunCompleted,
    onRunFailed,
    onRunEvent,
    onRunCancelled,
  } = args;

  const [isTransforming, setIsTransforming] = useState(false);
  const [transformProgress, setTransformProgress] = useState<TransformProgressState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runGenerationRef = useRef(0);
  const filesRef = useRef(files);
  const selectedModelRef = useRef(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const cancelTransform = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const postTransform = useCallback(
    async (body: RunTransformBody) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const generation = ++runGenerationRef.current;
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
          if (runGenerationRef.current !== generation) return;
          void onRunEvent?.(event);
          const next = transformEventToProgress(event);
          if (next) setTransformProgress(next);
        });

        applyTransformComplete(result, filesRef.current, setFiles, addToHistory, persistFiles);

        // The edit succeeded, but some operations could not be applied even after retries. Say so
        // — otherwise the user sees a clean success for a change that was only partly made.
        if (result.warnings?.length) {
          toast.warning(
            `Applied with ${result.warnings.length} issue${result.warnings.length === 1 ? '' : 's'}`,
            { description: result.warnings.join('\n') }
          );
        }

        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          await onRunCancelled?.();
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
        if (runGenerationRef.current === generation) {
          abortRef.current = null;
          setIsTransforming(false);
          setTransformProgress(null);
        }
      }
    },
    [setFiles, addToHistory, persistFiles, onRunEvent, onRunCancelled]
  );

  const runTransform = useCallback(async (promptOverride?: string) => {
    const requestedPrompt = promptOverride?.trim() || transformPrompt.trim();
    if (!requestedPrompt) return;
    // Clear immediately so a long run does not look like the prompt is still pending.
    setTransformPrompt('');
    let finalPrompt = requestedPrompt;
    if (selectedElement) {
      const cleanHtml = selectedElement.html
        .replace(/ data-source-file="[^"]*"/g, '')
        .replace(/ style="display: contents;"/g, '');
      const selectorLine = selectedElement.selector ? `CSS selector: ${selectedElement.selector}\n` : '';
      finalPrompt = `Target element in ${selectedElement.path}:\n${selectorLine}${cleanHtml}\n\nInstructions: ${requestedPrompt}`;
    }
    try {
      await onRunStarted?.(requestedPrompt);
      const result = await postTransform({
        projectName,
        activeFile: activeFilePath,
        prompt: finalPrompt,
        modelId: selectedModelRef.current.id || undefined,
        providerId: selectedModelRef.current.providerId || undefined,
      });
      if (!result) {
        // Cancelled — put the prompt back so the user can edit and resend.
        setTransformPrompt(requestedPrompt);
        return;
      }
      const nextFiles = result.full && result.files
        ? result.files
        : filesRef.current
            .filter((file) => !result.deletedPaths?.includes(file.path))
            .map((file) => result.files?.find((updated) => updated.path === file.path) || file)
            .concat((result.files || []).filter((updated) => !filesRef.current.some((file) => file.path === updated.path)));
      await onRunCompleted?.(requestedPrompt, nextFiles);
      setSelectedElement(null);
    } catch (error) {
      // Put the prompt back so the user can edit and retry after a failure.
      setTransformPrompt(requestedPrompt);
      await onRunFailed?.(requestedPrompt, error instanceof Error ? error.message : 'Build failed');
    }
  }, [
    transformPrompt,
    selectedElement,
    postTransform,
    projectName,
    activeFilePath,
    setTransformPrompt,
    setSelectedElement,
    onRunStarted,
    onRunCompleted,
    onRunFailed,
  ]);

  return {
    isTransforming,
    transformProgress,
    runTransform,
    cancelTransform,
  };
}
