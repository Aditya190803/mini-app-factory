import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireAdmin, requireProjectAccessById, requireProjectReadAccessById } from './auth';

const MESSAGE_PAGE = 200;
const VERSION_PAGE = 30;

/**
 * Version snapshots are stored in chunks. One document holding the whole project hit Convex's
 * 1 MiB document limit on larger apps, and the failed insert then marked a finished run failed.
 */
const SNAPSHOT_CHUNK_CHARS = 512_000;

/** A run whose last update is older than this is treated as dead (the request that owned it is gone). */
export const STALE_RUN_MS = 15 * 60 * 1000;

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

export const listMessages = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    const recent = await ctx.db
      .query('projectMessages')
      .withIndex('by_project_time', (q) => q.eq('projectId', projectId))
      .order('desc')
      .take(MESSAGE_PAGE);
    return recent.reverse();
  },
});

export const appendMessage = mutation({
  args: {
    projectId: v.id('projects'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.string(),
    status: v.optional(v.union(v.literal('pending'), v.literal('streaming'), v.literal('completed'), v.literal('failed'), v.literal('cancelled'))),
    runId: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const now = Date.now();
    return ctx.db.insert('projectMessages', {
      ...args,
      status: args.status ?? 'completed',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createVersion = mutation({
  args: {
    projectId: v.id('projects'),
    messageId: v.optional(v.id('projectMessages')),
    summary: v.string(),
    filesJson: v.string(),
  },
  handler: async (ctx, { filesJson, ...args }) => {
    await requireProjectAccessById(ctx, args.projectId);
    const versionId = await ctx.db.insert('projectVersions', {
      ...args,
      summary: args.summary.slice(0, 500),
      chunkCount: Math.ceil(filesJson.length / SNAPSHOT_CHUNK_CHARS),
      createdAt: Date.now(),
    });
    for (let index = 0; index * SNAPSHOT_CHUNK_CHARS < filesJson.length; index++) {
      await ctx.db.insert('projectVersionChunks', {
        projectId: args.projectId,
        versionId,
        index,
        data: filesJson.slice(index * SNAPSHOT_CHUNK_CHARS, (index + 1) * SNAPSHOT_CHUNK_CHARS),
      });
    }
    return versionId;
  },
});

export const listVersions = query({
  args: { projectId: v.id('projects'), before: v.optional(v.number()) },
  handler: async (ctx, { projectId, before }) => {
    await requireProjectReadAccessById(ctx, projectId);
    const versions = await ctx.db
      .query('projectVersions')
      .withIndex('by_project_time', (q) => (before === undefined ? q.eq('projectId', projectId) : q.eq('projectId', projectId).lt('createdAt', before)))
      .order('desc')
      .take(VERSION_PAGE);
    // The snapshot itself stays server-side; the list only needs the label.
    return versions.map(({ _id, _creationTime, projectId: id, messageId, summary, createdAt }) => ({ _id, _creationTime, projectId: id, messageId, summary, createdAt }));
  },
});

/** The oldest version, which is the first build. "Reset" restores it. */
export const getFirstVersion = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    const first = await ctx.db
      .query('projectVersions')
      .withIndex('by_project_time', (q) => q.eq('projectId', projectId))
      .order('asc')
      .first();
    return first ? { _id: first._id, summary: first.summary, createdAt: first.createdAt } : null;
  },
});

async function readSnapshot(ctx: QueryCtx | MutationCtx, version: Doc<'projectVersions'>): Promise<string> {
  if (version.filesJson !== undefined) return version.filesJson; // legacy single-document snapshot
  const chunks = await ctx.db
    .query('projectVersionChunks')
    .withIndex('by_version', (q) => q.eq('versionId', version._id))
    .collect();
  return chunks.sort((a, b) => a.index - b.index).map((chunk) => chunk.data).join('');
}

type SnapshotFile = {
  path: string;
  content: string;
  language: 'html' | 'css' | 'javascript' | 'sql' | 'json';
  fileType: 'page' | 'partial' | 'style' | 'script' | 'worker' | 'migration' | 'config';
};

async function loadVersionFiles(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, versionId: Id<'projectVersions'>) {
  const version = await ctx.db.get(versionId);
  if (!version || version.projectId !== projectId) throw new Error('Version not found');
  const files = JSON.parse(await readSnapshot(ctx, version)) as SnapshotFile[];
  if (!Array.isArray(files) || files.some((file) => !file || typeof file.path !== 'string' || typeof file.content !== 'string')) {
    throw new Error('Version snapshot is invalid');
  }
  return files;
}

/** The files of one version, for previewing and diffing before a restore. */
export const getVersionFiles = query({
  args: { projectId: v.id('projects'), versionId: v.id('projectVersions') },
  handler: async (ctx, { projectId, versionId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    return loadVersionFiles(ctx, projectId, versionId);
  },
});

export const restoreVersion = mutation({
  args: { projectId: v.id('projects'), versionId: v.id('projectVersions') },
  handler: async (ctx, { projectId, versionId }) => {
    const project = await requireProjectAccessById(ctx, projectId);
    const files = await loadVersionFiles(ctx, projectId, versionId);
    const existing = await ctx.db.query('projectFiles').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect();
    for (const file of existing) await ctx.db.delete(file._id);
    const now = Date.now();
    for (const file of files) await ctx.db.insert('projectFiles', { ...file, projectId, createdAt: now, updatedAt: now });
    // Bump the version so a tab still holding the pre-restore files cannot save over the restore.
    const filesVersion = (project.filesVersion ?? 0) + 1;
    await ctx.db.patch(projectId, { updatedAt: now, filesVersion, pageCount: files.filter((file) => file.fileType === 'page').length });
    return { files, filesVersion };
  },
});

export const createRun = mutation({
  args: {
    projectId: v.id('projects'),
    kind: v.union(v.literal('initial'), v.literal('build'), v.literal('discuss'), v.literal('repair')),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const now = Date.now();
    // One file-writing run per project. Two tabs (or a double-fired effect) running builds at
    // once doubled the cost and the second save overwrote the first. Discussion does not write
    // files, so it is exempt.
    if (args.kind !== 'discuss') {
      const recent = await ctx.db.query('generationRuns').withIndex('by_project_time', (q) => q.eq('projectId', args.projectId)).order('desc').take(10);
      const active = recent.find((run) => run.kind !== 'discuss' && ACTIVE_RUN_STATUSES.has(run.status) && now - run.updatedAt < STALE_RUN_MS);
      if (active) throw new Error('RUN_IN_PROGRESS: Another build is already running for this project');
    }
    return ctx.db.insert('generationRuns', { ...args, status: 'running', createdAt: now, updatedAt: now });
  },
});

export const appendRunEvent = mutation({
  args: {
    projectId: v.id('projects'),
    runId: v.id('generationRuns'),
    type: v.string(),
    message: v.string(),
    path: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error('Run not found');
    const latest = await ctx.db.query('runEvents').withIndex('by_run_sequence', (q) => q.eq('runId', args.runId)).order('desc').first();
    // Doubles as a heartbeat, so a long run is not mistaken for a stale one.
    if (ACTIVE_RUN_STATUSES.has(run.status)) await ctx.db.patch(args.runId, { updatedAt: Date.now() });
    return ctx.db.insert('runEvents', { ...args, sequence: (latest?.sequence ?? 0) + 1, createdAt: Date.now() });
  },
});

export const finishRun = mutation({
  args: {
    projectId: v.id('projects'),
    runId: v.id('generationRuns'),
    status: v.union(v.literal('completed'), v.literal('failed'), v.literal('cancelled')),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error('Run not found');
    // Usage is recorded even when the status is already final: a cancelled run still spent tokens.
    const usage = { inputTokens: args.inputTokens, outputTokens: args.outputTokens, model: args.model };
    if (args.inputTokens !== undefined || args.outputTokens !== undefined) await ctx.db.patch(args.runId, usage);
    // Terminal states are final: a late "failed" must not overwrite "completed", and a model call
    // that finishes after the user pressed Stop must not flip "cancelled" back to "completed".
    if (!ACTIVE_RUN_STATUSES.has(run.status)) return { status: run.status };
    await ctx.db.patch(args.runId, { status: args.status, errorCode: args.errorCode, errorMessage: args.errorMessage, updatedAt: Date.now() });
    return { status: args.status };
  },
});

export const cancelRun = mutation({
  args: { projectId: v.id('projects'), runId: v.id('generationRuns') },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error('Run not found');
    if (ACTIVE_RUN_STATUSES.has(run.status)) await ctx.db.patch(args.runId, { status: 'cancelled', updatedAt: Date.now() });
    // A cancelled first build must not leave the project "generating": the editor restarts
    // generation for projects in that state, so reloading used to start the build again.
    const project = await ctx.db.get(args.projectId);
    if (project?.status === 'generating') await ctx.db.patch(args.projectId, { status: 'error', updatedAt: Date.now() });
  },
});

export const getActiveRun = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    const runs = await ctx.db.query('generationRuns').withIndex('by_project_time', (q) => q.eq('projectId', projectId)).order('desc').take(10);
    return runs.find((run) => ACTIVE_RUN_STATUSES.has(run.status)) ?? null;
  },
});

export const listRunEvents = query({
  args: { projectId: v.id('projects'), runId: v.id('generationRuns'), afterSequence: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectReadAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) return [];
    return ctx.db
      .query('runEvents')
      .withIndex('by_run_sequence', (q) => q.eq('runId', args.runId).gt('sequence', args.afterSequence ?? 0))
      .take(500);
  },
});

export const getRunStatus = query({
  args: { projectId: v.id('projects'), runId: v.id('generationRuns') },
  handler: async (ctx, args) => {
    await requireProjectReadAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    return run?.projectId === args.projectId ? run.status : null;
  },
});

/** Recent failed runs across all projects, for the admin failure dashboard. */
export const listRecentFailures = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const runs = await ctx.db.query('generationRuns').withIndex('by_status_time', (q) => q.eq('status', 'failed')).order('desc').take(50);
    return Promise.all(runs.map(async (run) => ({
      _id: run._id,
      kind: run.kind,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      updatedAt: run.updatedAt,
      projectName: (await ctx.db.get(run.projectId))?.projectName ?? null,
    })));
  },
});

/**
 * Cron: fail runs whose request died without finishing them, and release projects stuck in
 * "generating". Without this a crashed or timed-out request left the run "running" forever, and
 * reloading the editor restarted generation.
 */
export const reapStaleRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_RUN_MS;
    let reaped = 0;
    for (const status of ['running', 'queued'] as const) {
      const stale = await ctx.db
        .query('generationRuns')
        .withIndex('by_status_time', (q) => q.eq('status', status).lt('updatedAt', cutoff))
        .take(100);
      for (const run of stale) {
        await ctx.db.patch(run._id, { status: 'failed', errorCode: 'RUN_TIMEOUT', errorMessage: 'The run stopped responding and was marked failed.', updatedAt: Date.now() });
        const project = await ctx.db.get(run.projectId);
        if (project?.status === 'generating') await ctx.db.patch(project._id, { status: 'error', updatedAt: Date.now() });
        reaped++;
      }
    }
    const stuck = await ctx.db.query('projects').withIndex('by_status_updated', (q) => q.eq('status', 'generating').lt('updatedAt', cutoff)).take(100);
    for (const project of stuck) await ctx.db.patch(project._id, { status: 'error', updatedAt: Date.now() });
    return { reaped, stuckProjects: stuck.length };
  },
});
