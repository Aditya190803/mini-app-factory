/// <reference types="vite/client" />
import { describe, test, expect, vi, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '@/convex/schema';
import { api, internal } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

/**
 * Roles, collaboration, conversations/runs, deployments and the data migrations.
 * The authorization file covers "strangers get nothing"; this one covers what each member role
 * may and may not do, and the run/version bookkeeping the audit found broken.
 */

const modules = import.meta.glob('../convex/**/*.ts');

const OWNER = { subject: 'user_owner', email: 'owner@example.com', emailVerified: true };
const EDITOR = { subject: 'user_editor', email: 'editor@example.com', emailVerified: true };
const VIEWER = { subject: 'user_viewer', email: 'viewer@example.com', emailVerified: true };
const STRANGER = { subject: 'user_stranger', email: 'stranger@example.com', emailVerified: true };

const file = (path: string, content = `<h1>${path}</h1>`) => ({ path, content, language: 'html' as const, fileType: 'page' as const });

afterEach(() => {
  vi.useRealTimers();
});

/** A project owned by OWNER, with EDITOR and VIEWER invited and accepted. */
async function sharedProject(name = 'shared') {
  const t = convexTest(schema, modules);
  await t.withIdentity(OWNER).mutation(api.projects.reserveProjectName, { projectName: name, prompt: 'p' });
  const project = (await t.withIdentity(OWNER).query(api.projects.getProject, { projectName: name }))!;
  for (const [identity, role] of [[EDITOR, 'editor'], [VIEWER, 'viewer']] as const) {
    const inviteId = await t.withIdentity(OWNER).mutation(api.collaboration.createInvite, { projectId: project._id, role });
    await t.withIdentity(identity).mutation(api.collaboration.acceptInvite, { inviteId });
  }
  return { t, projectId: project._id as Id<'projects'>, name };
}

describe('project roles', () => {
  test('getProject reports each caller\'s role and hides the env var ciphertext', async () => {
    const { t, name, projectId } = await sharedProject();
    await t.run(async (ctx) => ctx.db.patch(projectId, { cloudflareEnvVarsEncrypted: 'maf2.secret' }));
    for (const [identity, role] of [[OWNER, 'owner'], [EDITOR, 'editor'], [VIEWER, 'viewer']] as const) {
      const project = await t.withIdentity(identity).query(api.projects.getProject, { projectName: name });
      expect(project?.accessRole).toBe(role);
      expect(project).not.toHaveProperty('cloudflareEnvVarsEncrypted');
      expect(project?.hasCloudflareEnvVars).toBe(true);
    }
    expect(await t.withIdentity(STRANGER).query(api.projects.getProject, { projectName: name })).toBeNull();
  });

  test('only the owner can read the env var ciphertext or write Cloudflare config', async () => {
    const { t, name } = await sharedProject();
    await expect(t.withIdentity(EDITOR).query(api.projects.getProjectCloudflareEnvVars, { projectName: name })).rejects.toThrow();
    await expect(t.withIdentity(EDITOR).mutation(api.projects.updateCloudflareConfig, { projectName: name, cloudflareEnvVarsEncrypted: 'pasted' })).rejects.toThrow();
    await expect(t.withIdentity(VIEWER).mutation(api.projects.updateCloudflareConfig, { projectName: name, cloudflareResourcesJson: '{}' })).rejects.toThrow();
    await t.withIdentity(OWNER).mutation(api.projects.updateCloudflareConfig, { projectName: name, cloudflareEnvVarsEncrypted: 'maf2.x' });
    expect(await t.withIdentity(OWNER).query(api.projects.getProjectCloudflareEnvVars, { projectName: name })).toBe('maf2.x');
  });

  test('editors can save files; viewers cannot', async () => {
    const { t, projectId } = await sharedProject();
    await t.withIdentity(EDITOR).mutation(api.files.saveFiles, { projectId, files: [file('index.html')] });
    await expect(t.withIdentity(VIEWER).mutation(api.files.saveFiles, { projectId, files: [] })).rejects.toThrow();
    expect(await t.withIdentity(VIEWER).query(api.files.getFilesByProject, { projectId })).toHaveLength(1);
  });

  test('publishing and deletion are owner-only', async () => {
    const { t, name } = await sharedProject();
    await expect(t.withIdentity(EDITOR).mutation(api.projects.publishProject, { projectName: name })).rejects.toThrow();
    await expect(t.withIdentity(EDITOR).mutation(api.projects.deleteProject, { projectName: name })).rejects.toThrow();
    await t.withIdentity(OWNER).mutation(api.projects.publishProject, { projectName: name });
  });

  test('an editor\'s save cannot flip the published flag', async () => {
    const { t, name } = await sharedProject();
    await t.withIdentity(EDITOR).mutation(api.projects.saveProject, { projectName: name, prompt: 'p', status: 'completed', isPublished: true });
    const project = await t.withIdentity(OWNER).query(api.projects.getProject, { projectName: name });
    expect(project?.isPublished).toBe(false);
  });

  test('legacy ownerless projects are locked until an admin assigns an owner', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => ctx.db.insert('projects', { projectName: 'orphan', prompt: 'p', status: 'completed', isPublished: false, createdAt: 1, updatedAt: 1 }));
    expect(await t.withIdentity(STRANGER).query(api.projects.getProject, { projectName: 'orphan' })).toBeNull();
    await t.mutation(internal.projects.assignOrphanOwner, { projectName: 'orphan', userId: OWNER.subject });
    expect((await t.withIdentity(OWNER).query(api.projects.getProject, { projectName: 'orphan' }))?.accessRole).toBe('owner');
  });

  test('editors can duplicate; viewers can only copy published projects', async () => {
    const { t, name } = await sharedProject();
    await expect(t.withIdentity(VIEWER).mutation(api.projects.remixPublishedProject, { sourceProjectName: name, projectName: 'viewer-copy' })).rejects.toThrow();
    const copy = await t.withIdentity(EDITOR).mutation(api.projects.remixPublishedProject, { sourceProjectName: name, projectName: 'editor-copy' });
    expect(copy.projectName).toBe('editor-copy');
    expect((await t.withIdentity(EDITOR).query(api.projects.getProject, { projectName: 'editor-copy' }))?.accessRole).toBe('owner');
  });

  test('project names follow the DNS-label rule', async () => {
    const t = convexTest(schema, modules);
    for (const bad of ['--x', '---', 'a--b', 'x-', 'a'.repeat(59)]) {
      await expect(t.withIdentity(OWNER).mutation(api.projects.reserveProjectName, { projectName: bad, prompt: 'p' })).rejects.toThrow();
    }
  });
});

describe('invitations', () => {
  test('accepting a viewer invite never downgrades an editor', async () => {
    const { t, projectId } = await sharedProject();
    const inviteId = await t.withIdentity(OWNER).mutation(api.collaboration.createInvite, { projectId, role: 'viewer' });
    await t.withIdentity(EDITOR).mutation(api.collaboration.acceptInvite, { inviteId });
    const project = await t.withIdentity(EDITOR).query(api.projects.getProject, { projectName: 'shared' });
    expect(project?.accessRole).toBe('editor');
  });

  test('getInvite tolerates malformed ids and describes valid ones', async () => {
    const { t, projectId } = await sharedProject();
    expect(await t.withIdentity(STRANGER).query(api.collaboration.getInvite, { inviteId: 'not-an-id' })).toBeNull();
    const inviteId = await t.withIdentity(OWNER).mutation(api.collaboration.createInvite, { projectId, role: 'editor' });
    expect(await t.withIdentity(STRANGER).query(api.collaboration.getInvite, { inviteId })).toMatchObject({ projectName: 'shared', role: 'editor' });
  });

  test('only the owner manages access', async () => {
    const { t, projectId } = await sharedProject();
    await expect(t.withIdentity(EDITOR).mutation(api.collaboration.createInvite, { projectId, role: 'editor' })).rejects.toThrow();
    expect(await t.withIdentity(EDITOR).query(api.collaboration.listAccess, { projectId })).toBeNull();
  });
});

describe('file versions', () => {
  test('saveFile and deleteFile bump filesVersion so a stale snapshot is rejected', async () => {
    const { t, projectId } = await sharedProject();
    const first = await t.withIdentity(OWNER).mutation(api.files.saveFiles, { projectId, files: [file('index.html'), file('about.html')] });
    const single = await t.withIdentity(EDITOR).mutation(api.files.saveFile, { projectId, ...file('index.html', 'edited') });
    expect(single.filesVersion).toBe(first.filesVersion + 1);
    await expect(
      t.withIdentity(OWNER).mutation(api.files.saveFiles, { projectId, files: [file('index.html')], expectedVersion: first.filesVersion })
    ).rejects.toThrow(/changed since they were loaded/);
    const deleted = await t.withIdentity(EDITOR).mutation(api.files.deleteFile, { projectId, path: 'about.html' });
    expect(deleted.filesVersion).toBe(single.filesVersion + 1);
  });

  test('rejects oversized files', async () => {
    const { t, projectId } = await sharedProject();
    await expect(t.withIdentity(OWNER).mutation(api.files.saveFiles, { projectId, files: [file('big.html', 'x'.repeat(900_000))] })).rejects.toThrow(/too large/);
  });

  test('getFilesSnapshot returns files with the version they belong to', async () => {
    const { t, projectId } = await sharedProject();
    const saved = await t.withIdentity(OWNER).mutation(api.files.saveFiles, { projectId, files: [file('index.html')] });
    const snapshot = await t.withIdentity(VIEWER).query(api.files.getFilesSnapshot, { projectId });
    expect(snapshot).toMatchObject({ filesVersion: saved.filesVersion, files: [expect.objectContaining({ path: 'index.html' })] });
  });
});

describe('versions', () => {
  test('large snapshots are chunked and restore intact, bumping filesVersion', async () => {
    const { t, projectId } = await sharedProject();
    const files = Array.from({ length: 4 }, (_, index) => file(`page${index}.html`, 'y'.repeat(400_000)));
    const versionId = await t.withIdentity(EDITOR).mutation(api.conversations.createVersion, { projectId, summary: 'big', filesJson: JSON.stringify(files) });
    const chunks = await t.run(async (ctx) => ctx.db.query('projectVersionChunks').withIndex('by_version', (q) => q.eq('versionId', versionId)).collect());
    expect(chunks.length).toBeGreaterThan(1);

    const before = (await t.withIdentity(OWNER).query(api.projects.getProject, { projectName: 'shared' }))?.filesVersion ?? 0;
    const restored = await t.withIdentity(EDITOR).mutation(api.conversations.restoreVersion, { projectId, versionId });
    expect(restored.files).toHaveLength(4);
    expect(restored.filesVersion).toBe(before + 1);
    expect(await t.withIdentity(VIEWER).query(api.conversations.getVersionFiles, { projectId, versionId })).toHaveLength(4);
  });

  test('listVersions pages and omits the snapshot; getFirstVersion finds the oldest', async () => {
    const { t, projectId } = await sharedProject();
    vi.useFakeTimers();
    for (let index = 0; index < 32; index++) {
      vi.setSystemTime(1_000_000 + index * 1000);
      await t.withIdentity(OWNER).mutation(api.conversations.createVersion, { projectId, summary: `v${index}`, filesJson: '[]' });
    }
    const first = await t.withIdentity(OWNER).query(api.conversations.listVersions, { projectId });
    expect(first).toHaveLength(30);
    expect(first[0]).not.toHaveProperty('filesJson');
    const second = await t.withIdentity(OWNER).query(api.conversations.listVersions, { projectId, before: first[29]!.createdAt });
    expect(second.map((version) => version.summary)).toEqual(['v1', 'v0']);
    expect((await t.withIdentity(OWNER).query(api.conversations.getFirstVersion, { projectId }))?.summary).toBe('v0');
  });
});

describe('runs', () => {
  test('one file-writing run at a time; discussion is exempt', async () => {
    const { t, projectId } = await sharedProject();
    await t.withIdentity(OWNER).mutation(api.conversations.createRun, { projectId, kind: 'build', prompt: 'a' });
    await expect(t.withIdentity(EDITOR).mutation(api.conversations.createRun, { projectId, kind: 'build', prompt: 'b' })).rejects.toThrow(/RUN_IN_PROGRESS/);
    await t.withIdentity(EDITOR).mutation(api.conversations.createRun, { projectId, kind: 'discuss', prompt: 'c' });
  });

  test('terminal states are final, but usage is still recorded', async () => {
    const { t, projectId } = await sharedProject();
    const runId = await t.withIdentity(OWNER).mutation(api.conversations.createRun, { projectId, kind: 'build', prompt: 'a' });
    await t.withIdentity(OWNER).mutation(api.conversations.cancelRun, { projectId, runId });
    const result = await t.withIdentity(OWNER).mutation(api.conversations.finishRun, { projectId, runId, status: 'completed', inputTokens: 10, outputTokens: 20, model: 'm' });
    expect(result.status).toBe('cancelled');
    const run = await t.run(async (ctx) => ctx.db.get(runId));
    expect(run).toMatchObject({ status: 'cancelled', inputTokens: 10, outputTokens: 20 });
  });

  test('cancelling releases a project stuck in generating', async () => {
    const { t, projectId } = await sharedProject();
    await t.run(async (ctx) => ctx.db.patch(projectId, { status: 'generating' }));
    const runId = await t.withIdentity(OWNER).mutation(api.conversations.createRun, { projectId, kind: 'initial', prompt: 'a' });
    await t.withIdentity(OWNER).mutation(api.conversations.cancelRun, { projectId, runId });
    expect((await t.run(async (ctx) => ctx.db.get(projectId)))?.status).toBe('error');
  });

  test('the reaper fails stale runs and frees stuck projects', async () => {
    const { t, projectId } = await sharedProject();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const runId = await t.withIdentity(OWNER).mutation(api.conversations.createRun, { projectId, kind: 'initial', prompt: 'a' });
    await t.run(async (ctx) => ctx.db.patch(projectId, { status: 'generating', updatedAt: 1_000_000 }));
    vi.setSystemTime(1_000_000 + 16 * 60 * 1000);
    const result = await t.mutation(internal.conversations.reapStaleRuns, {});
    expect(result.reaped).toBe(1);
    expect((await t.run(async (ctx) => ctx.db.get(runId)))?.status).toBe('failed');
    expect((await t.run(async (ctx) => ctx.db.get(projectId)))?.status).toBe('error');
    expect(await t.withIdentity(OWNER).query(api.conversations.getLatestRun, { projectId })).toMatchObject({ status: 'failed', errorCode: 'RUN_TIMEOUT' });
  });

  test('listRunEvents reads past a sequence through the index', async () => {
    const { t, projectId } = await sharedProject();
    const runId = await t.withIdentity(OWNER).mutation(api.conversations.createRun, { projectId, kind: 'build', prompt: 'a' });
    for (const message of ['one', 'two', 'three']) {
      await t.withIdentity(OWNER).mutation(api.conversations.appendRunEvent, { projectId, runId, type: 'progress', message });
    }
    const events = await t.withIdentity(VIEWER).query(api.conversations.listRunEvents, { projectId, runId, afterSequence: 1 });
    expect(events.map((event) => event.message)).toEqual(['two', 'three']);
  });
});

describe('deployment history', () => {
  test('editors record deployments, viewers read them, strangers get nothing', async () => {
    const { t, projectId } = await sharedProject();
    await t.withIdentity(EDITOR).mutation(api.deployments.addDeploymentHistory, { projectId, provider: 'cloudflare', deploymentUrl: 'https://x.pages.dev' });
    await expect(t.withIdentity(VIEWER).mutation(api.deployments.addDeploymentHistory, { projectId, provider: 'x' })).rejects.toThrow();
    expect(await t.withIdentity(VIEWER).query(api.deployments.getDeploymentHistory, { projectId })).toHaveLength(1);
    await expect(t.withIdentity(STRANGER).query(api.deployments.getDeploymentHistory, { projectId })).rejects.toThrow();
  });
});

describe('project deletion', () => {
  test('removes every child table, including version chunks', async () => {
    vi.useFakeTimers();
    const { t, projectId, name } = await sharedProject();
    await t.withIdentity(OWNER).mutation(api.files.saveFiles, { projectId, files: [file('index.html')] });
    await t.withIdentity(OWNER).mutation(api.conversations.createVersion, { projectId, summary: 's', filesJson: JSON.stringify([file('index.html')]) });
    await t.withIdentity(OWNER).mutation(api.projects.deleteProject, { projectName: name });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const leftovers = await t.run(async (ctx) => ({
      files: await ctx.db.query('projectFiles').collect(),
      chunks: await ctx.db.query('projectVersionChunks').collect(),
      members: await ctx.db.query('projectMembers').collect(),
    }));
    expect(leftovers).toEqual({ files: [], chunks: [], members: [] });
  });
});

describe('migrations', () => {
  test('backfillLegacyProjects moves html into files and drops the legacy fields', async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.run(async (ctx) => ctx.db.insert('projects', {
      projectName: 'legacy', prompt: 'p', status: 'completed', userId: OWNER.subject, isPublished: false,
      html: '<h1>Old</h1>', globalCss: 'h1{}', createdAt: 1, updatedAt: 1,
    }));
    const result = await t.mutation(internal.migrations.backfillLegacyProjects, {});
    expect(result).toMatchObject({ migrated: 1, cleared: 1, done: true });
    const after = await t.run(async (ctx) => ({
      project: await ctx.db.get(projectId),
      files: await ctx.db.query('projectFiles').withIndex('by_project', (q) => q.eq('projectId', projectId)).collect(),
    }));
    expect(after.project?.html).toBeUndefined();
    expect(after.files.map((f) => f.path).sort()).toEqual(['index.html', 'styles.css']);
    // Idempotent.
    expect(await t.mutation(internal.migrations.backfillLegacyProjects, {})).toMatchObject({ migrated: 0, cleared: 0 });
  });
});

describe('AI quota', () => {
  test('daily quota stops further AI requests and is reported', async () => {
    const t = convexTest(schema, modules);
    process.env.MAF_AI_DAILY_LIMIT = '2';
    try {
      const consume = () => t.withIdentity(OWNER).mutation(api.rateLimits.consume, { bucket: 'transform', also: ['ai-daily', 'ai-monthly'] });
      expect((await consume()).allowed).toBe(true);
      expect((await consume()).allowed).toBe(true);
      const third = await consume();
      expect(third).toMatchObject({ allowed: false, bucket: 'ai-daily' });
      const quota = await t.withIdentity(OWNER).query(api.rateLimits.getAiQuota, {});
      expect(quota.daily).toMatchObject({ used: 2, limit: 2 });
      // A refused request charges nothing.
      expect(quota.monthly.used).toBe(2);
    } finally {
      delete process.env.MAF_AI_DAILY_LIMIT;
    }
  });
});
