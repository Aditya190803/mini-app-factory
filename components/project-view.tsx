'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Database, FileCode2, RotateCcw, Server, TriangleAlert } from 'lucide-react';
import { Badge, Button, Callout, Spinner, StatusDot } from '@/components/kit';
import { PROVIDER_LABELS } from '@/lib/ai-admin-config';
import { track } from '@vercel/analytics';

/** Failures that another provider may well not have. */
const PROVIDER_ERROR_CODES = new Set(['AI_PROVIDER_ERROR', 'AI_TIMEOUT', 'AI_NETWORK_ERROR', 'AI_AUTH_ERROR', 'AI_ERROR', 'RUN_TIMEOUT']);
import EditorWorkspace from '@/components/editor-workspace';
import type { ProjectMetadata } from '@/lib/projects';
import type { ProjectFile } from '@/lib/page-builder';
import { readStream } from '@/lib/stream-utils';
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

/**
 * Each event gets a shape as well as a colour. A row that only differed by hue
 * would be unreadable to anyone who cannot separate the two greens.
 */
function ActivityIcon({ activity }: { activity: Activity }) {
  if (activity.state === 'error')
    return <TriangleAlert className="size-3.5 text-[var(--destructive-text)]" />;
  if (activity.state === 'complete')
    return <Check className="size-3.5 text-[var(--success-text)]" />;
  if (activity.status === 'file')
    return <FileCode2 className="size-3.5 text-[var(--signal-text)]" />;
  if (activity.message.toLowerCase().includes('database'))
    return <Database className="size-3.5 text-[var(--signal-text)]" />;
  if (activity.message.toLowerCase().includes('api'))
    return <Server className="size-3.5 text-[var(--signal-text)]" />;
  return <Spinner className="size-3.5 text-[var(--signal-text)]" />;
}

export default function ProjectView({ projectName, initialProject }: ProjectViewProps) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectMetadata & { files?: ProjectFile[] }>(initialProject);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const hasStarted = useRef(false);
  const completed = useRef(initialProject.status === 'completed');
  // Leaving the page must stop the stream reader and the completion poll; the build itself
  // carries on server-side and is picked up again from the run record.
  const unmounted = useRef(false);
  const streamController = useRef<AbortController | null>(null);
  useEffect(() => () => {
    unmounted.current = true;
    streamController.current?.abort();
  }, []);
  const projectRecord = useQuery(api.projects.getProject, { projectName });
  const otherProvider: 'gateway' | 'opencode' = projectRecord?.providerId === 'opencode' ? 'gateway' : 'opencode';
  const latestRun = useQuery(api.conversations.getLatestRun, projectRecord?._id ? { projectId: projectRecord._id } : 'skip');
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
    for (let attempt = 0; attempt < 60 && !completed.current && !unmounted.current; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
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
        setActivities((current) =>
          current.map((item, index, all) =>
            index === all.length - 1 ? { ...item, state: 'error' } : { ...item, state: 'complete' }
          )
        );
        return;
      }
    }
    if (!completed.current && !unmounted.current) {
      setError({
        message: 'The build is taking too long or the connection dropped. Refresh this page or retry.',
        code: 'POLL_TIMEOUT',
      });
      setActivities((current) =>
        current.map((item, index, all) =>
          index === all.length - 1 ? { ...item, state: 'error' } : { ...item, state: 'complete' }
        )
      );
    }
  }, [projectName]);

  const startGeneration = useCallback(async (providerId?: 'gateway' | 'opencode') => {
    hasStarted.current = true;
    completed.current = false;
    setError(null);
    setActivities([]);
    const controller = new AbortController();
    streamController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, prompt: project.prompt, ...(providerId ? { providerId } : {}) }),
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
          track('first_build_completed');
          completed.current = true;
          setActivities((current) => current.map((item) => ({ ...item, state: 'complete' })));
          const result = data as { html?: string; files?: ProjectFile[] };
          setProject((current) => ({
            ...current,
            status: 'completed',
            html: result.html || current.html,
            files: result.files?.length ? result.files : current.files,
          }));
          return;
        }
        addActivity(String(data.status), String(data.message || data.status), typeof data.path === 'string' ? data.path : undefined);
      });
    } catch (cause) {
      if (unmounted.current) return;
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

  // Two ways in. A project with no run yet starts one; a project that already
  // has a run in flight (the page was reloaded mid-build) rehydrates from the
  // persisted events and polls instead of starting a second run.
  useEffect(() => {
    if (project.status === 'completed' || hasStarted.current || activeRun === undefined || latestRun === undefined) return;
    if (activeRun) {
      hasStarted.current = true;
      setActivities(
        (persistedEvents || []).map((event, index, all) => ({
          id: event._id,
          status: event.type,
          message: event.message,
          path: event.path,
          state: index === all.length - 1 ? 'running' : 'complete',
        }))
      );
      void pollForCompletion();
      return;
    }
    // Only a fresh project starts a build by itself. One that failed, was cancelled, or was left
    // "generating" by a dead request waits for Retry instead of silently spending another run.
    if (project.status !== 'pending') {
      hasStarted.current = true;
      setError({
        message: (latestRun?.status === 'failed' && latestRun.errorMessage) || 'The last build did not finish. Retry when you are ready.',
        code: (latestRun?.status === 'failed' && latestRun.errorCode) || 'RUN_INTERRUPTED',
      });
      return;
    }
    void startGeneration();
  }, [activeRun, latestRun, persistedEvents, pollForCompletion, project.status, startGeneration]);

  useEffect(() => {
    if (!hasStarted.current || !persistedEvents?.length || completed.current) return;
    setActivities(
      persistedEvents.map((event, index) => ({
        id: event._id,
        status: event.type,
        message: event.message,
        path: event.path,
        state: index === persistedEvents.length - 1 ? 'running' : 'complete',
      }))
    );
  }, [persistedEvents]);

  if (project.status === 'completed') {
    return (
      <EditorWorkspace
        initialHTML={project.html || ''}
        initialPrompt={project.prompt}
        projectName={projectName}
        onBack={() => router.push('/projects')}
      />
    );
  }

  const running = activities.some((activity) => activity.state === 'running');

  return (
    <main id="main" className="min-h-dvh bg-[var(--background)]">
      <div className="mx-auto grid min-h-dvh w-full max-w-[84rem] lg:grid-cols-[minmax(0,0.85fr)_minmax(26rem,1.15fr)]">
        <section className="flex flex-col justify-between border-b border-[var(--rule)] px-6 py-10 lg:border-b-0 lg:border-r lg:px-10 lg:py-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm tracking-[-0.02em] text-[var(--muted-foreground)]">
                {projectName}
              </span>
              {provider && <Badge tone="neutral" mono>{provider}</Badge>}
            </div>

            <h1 className="display-lg mt-8 max-w-xl">Turning that into files.</h1>

            <p className="mt-6 max-w-[54ch] text-md leading-relaxed text-[var(--muted-foreground)]">
              {project.prompt}
            </p>
          </div>

          <p className="mt-12 max-w-[46ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
            What you see on the right is the real event stream. File writes, validation, persistence,
            and provider switches appear as they happen, not on a timer.
          </p>
        </section>

        <section className="flex min-h-[32rem] flex-col px-6 py-8 lg:px-10 lg:py-14" aria-live="polite">
          <div className="ticked flex items-end justify-between gap-4 pb-2.5">
            <div>
              <h2 className="text-md font-medium">Build activity</h2>
              <p className="tabular mt-0.5 text-xs text-[var(--muted-foreground)]">
                {activities.length} event{activities.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <StatusDot tone={running ? 'live' : 'pending'} />
                {running ? 'Running' : 'Waiting'}
              </span>
              {activeRun && (
                <Button size="sm" onClick={() => void cancelGeneration()}>
                  Stop
                </Button>
              )}
            </div>
          </div>

          <ol className="scroll-thin mt-3 min-h-0 flex-1 divide-y divide-[var(--rule)] overflow-y-auto">
            {activities.length === 0 ? (
              <li className="flex items-center gap-3 py-4 text-sm text-[var(--muted-foreground)]">
                <Spinner />
                Connecting to the build
              </li>
            ) : (
              activities.map((activity) => (
                <li key={activity.id} className="anim-rise flex gap-3 py-2.5">
                  <span className="mt-0.5 shrink-0">
                    <ActivityIcon activity={activity} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{activity.message}</p>
                    {activity.path && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                        {activity.path}
                      </p>
                    )}
                  </div>
                </li>
              ))
            )}
          </ol>

          {error && (
            <Callout
              tone="failed"
              className="mt-5"
              title="The build stopped"
              action={
                <div className="flex flex-wrap gap-2">
                  {error.code === 'QUOTA_EXCEEDED' ? (
                    <Button size="sm" intent="primary" asChild>
                      <a href="/settings#api-keys">Add your own key</a>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void startGeneration()}>
                      <RotateCcw className="size-3.5" />
                      Retry
                    </Button>
                  )}
                  {/* Provider trouble is usually specific to one provider; offer the other. */}
                  {error.code && PROVIDER_ERROR_CODES.has(error.code) && (
                    <Button size="sm" onClick={() => void startGeneration(otherProvider)}>
                      Retry with {PROVIDER_LABELS[otherProvider]}
                    </Button>
                  )}
                </div>
              }
            >
              <p>{error.message}</p>
              {error.code && (
                <p className="mt-1 font-mono text-xs opacity-70">{error.code}</p>
              )}
            </Callout>
          )}
        </section>
      </div>
    </main>
  );
}
