'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle, Code2, Database, FileCode2, RotateCcw, Server, TriangleAlert } from 'lucide-react';
import EditorWorkspace from '@/components/editor-workspace';
import type { ProjectMetadata } from '@/lib/projects';
import type { ProjectFile } from '@/lib/page-builder';
import { readStream } from '@/lib/stream-utils';
import { withAIAdminHeaders } from '@/lib/ai-admin-client';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

interface ProjectViewProps {
  projectName: string;
  initialProject: ProjectMetadata;
}

type Activity = {
  id: string;
  status: string;
  message: string;
  path?: string;
  state: 'running' | 'complete' | 'error';
};

function ActivityIcon({ activity }: { activity: Activity }) {
  if (activity.state === 'error') return <TriangleAlert className="size-4 text-red-400" />;
  if (activity.state === 'complete') return <Check className="size-4 text-emerald-400" />;
  if (activity.status === 'file') return <FileCode2 className="size-4 text-[var(--primary)]" />;
  if (activity.message.toLowerCase().includes('database')) return <Database className="size-4 text-[var(--primary)]" />;
  if (activity.message.toLowerCase().includes('api')) return <Server className="size-4 text-[var(--primary)]" />;
  return <Circle className="size-3 animate-pulse fill-[var(--primary)] text-[var(--primary)]" />;
}

export default function ProjectView({ projectName, initialProject }: ProjectViewProps) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const completed = useRef(initialProject.status === 'completed');
  const projectRecord = useQuery(api.projects.getProject, { projectName });
  const activeRun = useQuery(api.conversations.getActiveRun, projectRecord?._id ? { projectId: projectRecord._id } : 'skip');
  const persistedEvents = useQuery(
    api.conversations.listRunEvents,
    projectRecord?._id && activeRun?._id ? { projectId: projectRecord._id, runId: activeRun._id } : 'skip'
  );

  const addActivity = useCallback((status: string, message: string, path?: string) => {
    setActivities((current) => {
      const finished = current.map((item) => item.state === 'running' ? { ...item, state: 'complete' as const } : item);
      const next: Activity = {
        id: `${Date.now()}-${finished.length}`,
        status,
        message,
        path,
        state: status === 'error' ? 'error' : 'running',
      };
      return [...finished, next].slice(-40);
    });
  }, []);

  const pollForCompletion = useCallback(async () => {
    for (let attempt = 0; attempt < 60 && !completed.current; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const response = await fetch(`/api/project/${projectName}`).catch(() => null);
      if (!response?.ok) continue;
      const data = await response.json();
      if (data.status === 'completed') {
        completed.current = true;
        setActivities((current) => current.map((item) => ({ ...item, state: 'complete' })));
        setProject((current) => ({ ...current, status: 'completed', html: data.html, files: data.files }));
        return;
      }
      if (data.status === 'error') {
        setError({ message: data.error || 'Generation failed', code: data.code });
        return;
      }
    }
  }, [projectName]);

  const startGeneration = useCallback(async () => {
    hasStarted.current = true;
    completed.current = false;
    setError(null);
    setActivities([]);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ projectName, prompt: project.prompt }),
        signal: controller.signal,
      });
      await readStream(response, () => {}, (data) => {
        if (data.status === 'ping') return;
        if (data.status === 'provider') {
          setProvider(typeof data.label === 'string' ? data.label : String(data.model || 'AI provider'));
          return;
        }
        if (data.status === 'fallback') {
          addActivity('provider', data.message || 'Switched to a fallback model');
          return;
        }
        if (data.status === 'error') {
          setError({ message: String(data.error || 'Generation failed'), code: typeof data.code === 'string' ? data.code : undefined });
          addActivity('error', data.error || 'Generation failed');
          return;
        }
        if (data.status === 'completed') {
          completed.current = true;
          setActivities((current) => current.map((item) => ({ ...item, state: 'complete' })));
          const result = data as { html: string; files?: ProjectFile[] };
          setProject((current) => ({ ...current, status: 'completed', html: result.html, files: result.files || current.files }));
          return;
        }
        addActivity(String(data.status), String(data.message || data.status), typeof data.path === 'string' ? data.path : undefined);
      });
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === 'AbortError';
      setError({ message: aborted ? 'Generation timed out.' : 'The live connection was interrupted. Checking the saved build…', code: aborted ? 'AI_TIMEOUT' : 'STREAM_ERROR' });
    } finally {
      clearTimeout(timeout);
    }
    if (!completed.current) await pollForCompletion();
  }, [addActivity, pollForCompletion, project.prompt, projectName]);

  const cancelGeneration = useCallback(async () => {
    if (!activeRun?._id) return;
    const response = await fetch('/api/runs/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, runId: activeRun._id }),
    });
    if (!response.ok) return;
    completed.current = true;
    setActivities((current) => [...current.map((item) => ({ ...item, state: 'complete' as const })), {
      id: `cancelled-${Date.now()}`,
      status: 'cancelled',
      message: 'Build cancelled',
      state: 'error',
    }]);
    setError({ message: 'Build cancelled. You can retry when ready.', code: 'ABORTED' });
  }, [activeRun?._id, projectName]);

  useEffect(() => {
    if (project.status === 'completed' || hasStarted.current || activeRun === undefined) return;
    if (activeRun) {
      hasStarted.current = true;
      setActivities((persistedEvents || []).map((event, index, all) => ({
        id: event._id,
        status: event.type,
        message: event.message,
        path: event.path,
        state: index === all.length - 1 ? 'running' : 'complete',
      })));
      void pollForCompletion();
      return;
    }
    void startGeneration();
  }, [activeRun, persistedEvents, pollForCompletion, project.status, startGeneration]);

  useEffect(() => {
    if (!hasStarted.current || !persistedEvents?.length || completed.current) return;
    setActivities(persistedEvents.map((event, index) => ({
      id: event._id,
      status: event.type,
      message: event.message,
      path: event.path,
      state: index === persistedEvents.length - 1 ? 'running' : 'complete',
    })));
  }, [persistedEvents]);

  if (project.status === 'completed') {
    return <EditorWorkspace initialHTML={project.html || ''} initialPrompt={project.prompt} projectName={projectName} onBack={() => router.push('/')} />;
  }

  return (
    <main className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <section className="flex flex-col justify-between border-b border-[var(--border)] p-8 lg:border-b-0 lg:border-r lg:p-12">
          <div>
            <div className="mb-10 flex items-center gap-3 text-xs font-mono text-[var(--muted-text)]">
              <Code2 className="size-4 text-[var(--primary)]" />
              <span>{projectName}</span>
              {provider ? <span className="rounded-full border border-[var(--border)] px-2 py-1">{provider}</span> : null}
            </div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--primary)]">Building your app</p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight md:text-4xl">Your request is becoming a working project.</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[var(--secondary-text)]">{project.prompt}</p>
          </div>
          <p className="mt-12 max-w-md text-xs leading-5 text-[var(--muted-text)]">You are seeing actual generation events. File creation, validation, persistence, and provider changes appear as they happen.</p>
        </section>

        <section className="flex min-h-[520px] flex-col p-6 lg:p-10" aria-live="polite">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Build activity</h2>
              <p className="mt-1 text-xs text-[var(--muted-text)]">Live, observable work</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-xs text-[var(--primary)]"><Circle className="size-2 fill-current" /> Running</span>
              {activeRun ? <button type="button" onClick={() => void cancelGeneration()} className="text-xs text-[var(--muted-text)] hover:text-red-300">Stop</button> : null}
            </div>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto border-y border-[var(--border)] py-3">
            {activities.length === 0 ? (
              <div className="flex items-center gap-3 px-2 py-4 text-sm text-[var(--muted-text)]"><Circle className="size-3 animate-pulse fill-current" /> Connecting to the build…</div>
            ) : activities.map((activity) => (
              <div key={activity.id} className="flex gap-3 rounded-md px-2 py-3 hover:bg-white/[0.025]">
                <div className="mt-0.5"><ActivityIcon activity={activity} /></div>
                <div className="min-w-0">
                  <p className="text-sm text-[var(--secondary-text)]">{activity.message}</p>
                  {activity.path ? <p className="mt-1 truncate font-mono text-[11px] text-[var(--muted-text)]">{activity.path}</p> : null}
                </div>
              </div>
            ))}
          </div>
          {error ? (
            <div className="mt-5 rounded-md border border-red-400/30 bg-red-400/5 p-4">
              <p className="text-sm text-red-300">{error.message}</p>
              {error.code ? <p className="mt-1 font-mono text-[10px] text-red-300/60">{error.code}</p> : null}
              <button type="button" onClick={() => void startGeneration()} className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[var(--foreground)] hover:text-[var(--primary)]"><RotateCcw className="size-3" /> Retry build</button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
