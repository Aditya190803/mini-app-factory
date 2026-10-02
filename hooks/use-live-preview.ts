'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { readApiError } from '@/lib/api-fetch';

type ConfirmFn = (options: { title: string; description: string; confirmLabel?: string; destructive?: boolean }) => Promise<boolean>;

/** The Cloudflare live-backend preview: deploy, take down, and clean up once it has expired. */
export function useLivePreview(params: {
  projectName: string;
  isOwner: boolean;
  previewProjectName?: string;
  previewExpiresAt?: number;
  confirm: ConfirmFn;
}) {
  const { projectName, isOwner, previewProjectName, previewExpiresAt, confirm } = params;
  const [isDeployingPreview, setIsDeployingPreview] = useState(false);
  const cleanupStarted = useRef(false);

  // Expired previews are removed the next time their owner opens the editor. The server also
  // reaps them before creating a new one, so this is a convenience, not the only path.
  useEffect(() => {
    if (cleanupStarted.current || !isOwner || !previewProjectName || (previewExpiresAt || 0) > Date.now()) return;
    cleanupStarted.current = true;
    void fetch('/api/cloudflare/preview', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName }),
    })
      .then((response) => { if (!response.ok) cleanupStarted.current = false; })
      .catch(() => { cleanupStarted.current = false; });
  }, [isOwner, previewExpiresAt, previewProjectName, projectName]);

  const deployLivePreview = useCallback(async () => {
    setIsDeployingPreview(true);
    try {
      const post = (confirmResources?: boolean) => fetch('/api/cloudflare/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, ...(confirmResources ? { confirmResources: true } : {}) }),
      });
      let response = await post();
      if (!response.ok) {
        const error = await readApiError(response);
        if (!error.needsConfirmation) throw new Error(error.message);
        const approved = await confirm({
          title: 'Create isolated preview resources?',
          description: 'This preview needs its own Cloudflare resources. They live for 24 hours and may be billable on paid plans.',
          confirmLabel: 'Create for 24 hours',
        });
        if (!approved) return;
        response = await post(true);
        if (!response.ok) throw new Error((await readApiError(response)).message);
      }
      toast.success('Live backend preview deployed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview deployment failed');
    } finally {
      setIsDeployingPreview(false);
    }
  }, [projectName, confirm]);

  const deleteLivePreview = useCallback(async () => {
    const approved = await confirm({
      title: 'Delete this preview?',
      description: 'The preview and its isolated Cloudflare resources are removed. Your project files are untouched.',
      confirmLabel: 'Delete preview',
      destructive: true,
    });
    if (!approved) return;
    const response = await fetch('/api/cloudflare/preview', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName }),
    });
    if (!response.ok) {
      toast.error((await readApiError(response)).message);
      return;
    }
    toast.success('Live preview resources deleted');
  }, [projectName, confirm]);

  return { isDeployingPreview, deployLivePreview, deleteLivePreview };
}
