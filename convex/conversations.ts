import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProjectAccessById, requireProjectReadAccessById } from './auth';

export const listMessages = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    return ctx.db.query('projectMessages').withIndex('by_project_time', (q) => q.eq('projectId', projectId)).collect();
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
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    return ctx.db.insert('projectVersions', { ...args, createdAt: Date.now() });
  },
});

export const listVersions = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    return ctx.db.query('projectVersions').withIndex('by_project_time', (q) => q.eq('projectId', projectId)).order('desc').take(30);
  },
});

export const restoreVersion = mutation({
  args: { projectId: v.id('projects'), versionId: v.id('projectVersions') },
  handler: async (ctx, { projectId, versionId }) => {
    await requireProjectAccessById(ctx, projectId);
    const version = await ctx.db.get(versionId);
    if (!version || version.projectId !== projectId) throw new Error('Version not found');
    const files = JSON.parse(version.filesJson) as Array<{
      path: string;
      content: string;
      language: 'html' | 'css' | 'javascript' | 'sql' | 'json';
      fileType: 'page' | 'partial' | 'style' | 'script' | 'worker' | 'migration' | 'config';
    }>;
    if (!Array.isArray(files) || files.some((file) => !file || typeof file.path !== 'string' || typeof file.content !== 'string')) {
      throw new Error('Version snapshot is invalid');
    }
    const existing = await ctx.db.query('projectFiles').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect();
    for (const file of existing) await ctx.db.delete(file._id);
    const now = Date.now();
    for (const file of files) await ctx.db.insert('projectFiles', { ...file, projectId, createdAt: now, updatedAt: now });
    await ctx.db.patch(projectId, { updatedAt: now, pageCount: files.filter((file) => file.fileType === 'page').length });
    return files;
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
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error('Run not found');
    await ctx.db.patch(args.runId, { status: args.status, errorCode: args.errorCode, errorMessage: args.errorMessage, updatedAt: Date.now() });
  },
});

export const cancelRun = mutation({
  args: { projectId: v.id('projects'), runId: v.id('generationRuns') },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error('Run not found');
    if (run.status === 'queued' || run.status === 'running') await ctx.db.patch(args.runId, { status: 'cancelled', updatedAt: Date.now() });
  },
});

export const getActiveRun = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, { projectId }) => {
    await requireProjectReadAccessById(ctx, projectId);
    const runs = await ctx.db.query('generationRuns').withIndex('by_project_time', (q) => q.eq('projectId', projectId)).order('desc').take(10);
    return runs.find((run) => run.status === 'queued' || run.status === 'running') ?? null;
  },
});

export const listRunEvents = query({
  args: { projectId: v.id('projects'), runId: v.id('generationRuns'), afterSequence: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireProjectReadAccessById(ctx, args.projectId);
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) return [];
    const events = await ctx.db.query('runEvents').withIndex('by_run_sequence', (q) => q.eq('runId', args.runId)).collect();
    return events.filter((event) => event.sequence > (args.afterSequence ?? 0));
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
