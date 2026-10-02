'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import type { ProjectFile } from '@/lib/page-builder';
import { migrateProject } from '@/lib/migration';

type ProjectRecord = (Doc<'projects'> & { accessRole: 'owner' | 'editor' | 'viewer' }) | null | undefined;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict';

type ConfirmFn = (options: { title: string; description: string; confirmLabel?: string }) => Promise<boolean>;

function toProjectFiles(records: Array<{ path: string; content: string; language: string; fileType: string }>): ProjectFile[] {
  return records.map((file) => ({
    path: file.path,
    content: file.content,
    language: file.language as ProjectFile['language'],
    fileType: file.fileType as ProjectFile['fileType'],
  }));
}

/**
 * The editor's files and their persistence: first load, debounced autosave, explicit flush,
 * optimistic concurrency against `filesVersion`, and conflict recovery.
 */
export function useProjectFiles(params: {
  projectName: string;
  initialHTML: string;
  initialPrompt: string;
  projectData: ProjectRecord;
  signedIn: boolean;
  confirm: ConfirmFn;
  /** Called once with the first files, to seed undo history. */
  onLoaded: (files: ProjectFile[]) => void;
}) {
  const { projectName, initialHTML, initialPrompt, projectData, signedIn, confirm, onLoaded } = params;
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [conflictKind, setConflictKind] = useState<'version' | 'error' | null>(null);

  /**
   * The filesVersion the in-memory `files` snapshot was built from.
   *
   * Sent with every save so a write built on stale state is rejected rather than applied —
   * saveFiles deletes any path missing from its input, so an overwrite is destructive, and now
   * that projects can have collaborators the other writer may be another person.
   *
   * Deliberately a ref, not derived from projectData: projectData.filesVersion is live and would
   * always match, which would make the check pass in exactly the case it exists to catch.
   */
  const filesVersionRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<ProjectFile[] | null>(null);
  /** The files array last known to match the server. Autosave skips when nothing changed since. */
  const lastSavedRef = useRef<ProjectFile[] | null>(null);
  const filesRef = useRef<ProjectFile[]>([]);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const saveProject = useMutation(api.projects.saveProject);
  const saveFilesAction = useMutation(api.files.saveFiles);
  const migrateLegacyFilesAction = useMutation(api.files.migrateLegacyFiles);
  const projectFiles = useQuery(api.files.getFilesByProject, projectData?._id ? { projectId: projectData._id } : 'skip');

  useEffect(() => {
    if (!projectFiles || hasLoaded) return;
    let loadedFiles: ProjectFile[] = [];
    if (projectFiles.length > 0) {
      loadedFiles = toProjectFiles(projectFiles);
      // Anchor optimistic concurrency to the version these files came from.
      filesVersionRef.current = projectData?.filesVersion ?? 0;
      lastSavedRef.current = loadedFiles;
    } else if (initialHTML) {
      loadedFiles = migrateProject(initialHTML);

      // Hand the migration to Convex rather than writing it through saveFiles. An empty
      // projectFiles read is indistinguishable from one that has not propagated yet, and
      // saveFiles deletes any path missing from its input — so racing a just-finished
      // generation used to replace every generated page with the legacy blob's few files.
      // migrateLegacyFiles re-checks emptiness inside the transaction and only ever inserts.
      if (projectData?._id) {
        migrateLegacyFilesAction({ projectId: projectData._id, files: loadedFiles })
          .then((result) => {
            filesVersionRef.current = result.filesVersion;
            lastSavedRef.current = loadedFiles;
          })
          .catch((err) => console.error('Legacy migration failed', err));

        void saveProject({
          projectName,
          prompt: initialPrompt,
          status: 'completed',
          isPublished: projectData.isPublished,
          isMultiPage: false,
          pageCount: 1,
        }).catch(() => undefined);
      }
    }

    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      onLoadedRef.current(loadedFiles);
      setHasLoaded(true);
    } else if (projectFiles.length === 0 && initialHTML === '') {
      setHasLoaded(true);
    }
  }, [projectFiles, initialHTML, projectData?._id, projectData?.isPublished, projectData?.filesVersion, hasLoaded, migrateLegacyFilesAction, saveProject, projectName, initialPrompt]);

  useEffect(() => {
    if (saveStatus !== 'saving' && saveStatus !== 'conflict') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);

  const canWrite = signedIn && Boolean(projectData?._id) && projectData?.accessRole !== 'viewer';

  const persistFiles = useCallback(async (
    nextFiles: ProjectFile[],
    opts?: { forceVersion?: number },
  ): Promise<boolean> => {
    if (!canWrite || !projectData?._id) return true;
    // Single-flight: a second writer (autosave racing a transform apply, two quick edits) queues
    // behind the in-flight save instead of racing it with the same expectedVersion — the loser
    // would always trip the version guard.
    if (savingRef.current) {
      pendingSaveRef.current = nextFiles;
      return true;
    }
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      let current = nextFiles;
      let override = opts?.forceVersion;
      for (;;) {
        const result = await saveFilesAction({
          projectId: projectData._id,
          files: current,
          expectedVersion: override ?? filesVersionRef.current ?? undefined,
        });
        filesVersionRef.current = result.filesVersion;
        lastSavedRef.current = current;
        override = undefined;
        const queued = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!queued) break;
        current = queued;
      }
      setConflictKind(null);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((status) => (status === 'saved' ? 'idle' : status)), 2000);
      return true;
    } catch (err) {
      pendingSaveRef.current = null;
      const message = err instanceof Error ? err.message : '';
      // A version mismatch means another writer (transform apply, migration, second tab) landed
      // first. Park in conflict and let the user choose — retrying the same stale snapshot would
      // fail forever.
      console.error('Save failed', err);
      setConflictKind(message.includes('changed since they were loaded') ? 'version' : 'error');
      setSaveStatus('conflict');
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [canWrite, projectData?._id, saveFilesAction]);

  // Debounced autosave. Never retries while a save is in flight or parked in conflict: the parked
  // snapshot is stale by definition.
  useEffect(() => {
    if (!canWrite || !files.length) return;
    if (saveStatus === 'saving' || saveStatus === 'conflict') return;
    if (files === lastSavedRef.current) return;
    const timer = setTimeout(() => void persistFiles(files), 2000);
    return () => clearTimeout(timer);
  }, [files, canWrite, saveStatus, persistFiles]);

  /**
   * Save now instead of waiting for the autosave debounce. Builds and deploys read the stored
   * files, so anything typed in the last two seconds was otherwise left out of them.
   */
  const flushSave = useCallback(async () => {
    for (let waited = 0; savingRef.current && waited < 100; waited++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (filesRef.current === lastSavedRef.current || filesRef.current.length === 0) return;
    if (!(await persistFiles(filesRef.current))) {
      throw new Error('Your latest edits could not be saved. Resolve the save conflict first.');
    }
  }, [persistFiles]);

  /** Adopt files the server already saved (a transform, a restore) as the saved baseline. */
  const adoptSavedFiles = useCallback((savedFiles: ProjectFile[], filesVersion?: number) => {
    if (filesVersion === undefined) return;
    filesVersionRef.current = filesVersion;
    lastSavedRef.current = savedFiles;
    setConflictKind(null);
    setSaveStatus('idle');
  }, []);

  const getFilesVersion = useCallback(() => filesVersionRef.current ?? undefined, []);

  const reloadFromServer = useCallback(async () => {
    const ok = await confirm({
      title: 'Load latest version?',
      description: 'Someone else saved changes to this project. Loading the latest discards your unsaved edits.',
      confirmLabel: 'Load latest',
    });
    if (!ok || !projectFiles) return;
    const serverFiles = toProjectFiles(projectFiles);
    filesVersionRef.current = projectData?.filesVersion ?? filesVersionRef.current;
    lastSavedRef.current = serverFiles;
    setConflictKind(null);
    setSaveStatus('idle');
    setFiles(serverFiles);
  }, [confirm, projectFiles, projectData?.filesVersion]);

  const overwriteServer = useCallback(async () => {
    const ok = await confirm({
      title: 'Save your version anyway?',
      description: 'This replaces the latest saved files with what you see in the editor. Changes saved by others will be lost.',
      confirmLabel: 'Save anyway',
    });
    if (!ok) return;
    await persistFiles(filesRef.current, {
      forceVersion: projectData?.filesVersion ?? filesVersionRef.current ?? undefined,
    });
  }, [confirm, persistFiles, projectData?.filesVersion]);

  return {
    files,
    setFiles,
    filesRef,
    saveStatus,
    conflictKind,
    persistFiles,
    flushSave,
    adoptSavedFiles,
    getFilesVersion,
    reloadFromServer,
    overwriteServer,
  };
}
