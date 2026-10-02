'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';

/** Export the project as a zip, with an AI-written README when the route can produce one. */
export function useZipExport(params: { projectName: string; initialPrompt: string; getFiles: () => ProjectFile[] }) {
  const { projectName, initialPrompt, getFiles } = params;
  const [isExporting, setIsExporting] = useState(false);
  // A ref, not the state: two clicks in the same tick both saw isExporting === false.
  const running = useRef(false);

  const exportZip = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setIsExporting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const file of getFiles()) zip.file(file.path, file.content);

      let readmeContent = `# ${projectName}\n\n${initialPrompt}\n\n---\nMade by [Mini App Factory](https://github.com/Aditya190803/mini-app-factory)`;
      try {
        // The route reads the project's files itself; its schema rejects a `files` key.
        const response = await fetch('/api/generate/readme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectName, prompt: initialPrompt }),
        });
        if (response.ok) {
          const data = (await response.json()) as { content?: string };
          if (data.content) readmeContent = data.content;
        } else {
          console.warn(`README generation failed (${response.status}), using fallback README`);
        }
      } catch (err) {
        console.error('Failed to generate AI README, using fallback', err);
      }
      zip.file('README.md', readmeContent);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Zip failed', err);
      toast.error('Export failed', { description: err instanceof Error ? err.message : 'The ZIP could not be generated.' });
    } finally {
      running.current = false;
      setIsExporting(false);
    }
  }, [getFiles, initialPrompt, projectName]);

  return { isExporting, exportZip };
}
