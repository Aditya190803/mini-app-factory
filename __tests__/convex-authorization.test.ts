/// <reference types="vite/client" />
import { describe, test, expect, beforeEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '@/convex/schema';
import { api } from '@/convex/_generated/api';

/**
 * The regression guard for the authorization migration.
 *
 * Before it, every Convex function was public and derived ownership from a `userId` argument the
 * caller supplied — so reaching the deployment was enough to read anyone's OAuth tokens and API
 * keys, and to overwrite or delete any project. These tests assert the two properties that fix
 * relies on:
 *
 *   1. an anonymous caller gets nothing,
 *   2. a signed-in caller cannot reach another user's data by naming it.
 *
 * `t.withIdentity({ subject })` mints a token for a given user; a bare `t` is anonymous.
 */

// convex-test needs to find the Convex modules; import.meta.glob is provided by Vite.
const modules = import.meta.glob('../convex/**/*.ts');

const ALICE = { subject: 'user_alice', email: 'alice@example.com', emailVerified: true };
const BOB = { subject: 'user_bob', email: 'bob@example.com', emailVerified: true };
const ADMIN = { subject: 'user_admin', email: 'admin@example.com', emailVerified: true };
const UNVERIFIED_ADMIN = { subject: 'user_x', email: 'admin@example.com', emailVerified: false };

function setup() {
  return convexTest(schema, modules);
}

/** Create a project owned by `identity` and return its name. */
async function makeProject(
  t: ReturnType<typeof convexTest>,
  identity: typeof ALICE,
  projectName: string
) {
  await t.withIdentity(identity).mutation(api.projects.reserveProjectName, {
    projectName,
    prompt: 'a test project',
  });
  return projectName;
}

beforeEach(() => {
  process.env.MAF_ADMIN_EMAILS = 'admin@example.com';
});

describe('Convex authorization', () => {
  describe('anonymous callers', () => {
    test('cannot read a user integration record', async () => {
      const t = setup();
      await expect(t.query(api.integrations.getIntegration, {})).rejects.toThrow();
    });

    test('cannot write integration tokens', async () => {
      const t = setup();
      await expect(
        t.mutation(api.integrations.upsertIntegration, { githubAccessToken: 'gho_stolen' })
      ).rejects.toThrow();
    });

    test('cannot read AI settings', async () => {
      const t = setup();
      await expect(t.query(api.aiSettings.getForCurrentUser, {})).rejects.toThrow();
    });

    test('cannot list projects', async () => {
      const t = setup();
      await expect(t.query(api.projects.getUserProjects, {})).rejects.toThrow();
    });

    test('cannot create a project', async () => {
      const t = setup();
      await expect(
        t.mutation(api.projects.reserveProjectName, { projectName: 'x', prompt: 'y' })
      ).rejects.toThrow();
    });

    test('cannot generate an upload URL', async () => {
      const t = setup();
      await expect(t.mutation(api.uploads.generateUploadUrl, {})).rejects.toThrow();
    });

    test('cannot run the full-table legacy cleanup', async () => {
      const t = setup();
      await expect(t.mutation(api.projects.cleanupLegacyFields, {})).rejects.toThrow();
    });

    test('gets null for an unpublished project', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-private');
      expect(await t.query(api.projects.getPublishedProject, { projectName: 'alice-private' })).toBeNull();
    });

    test('CAN read a published project — this is the one intended public path', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-public');
      await t.withIdentity(ALICE).mutation(api.projects.publishProject, { projectName: 'alice-public' });

      const project = await t.query(api.projects.getPublishedProject, { projectName: 'alice-public' });
      expect(project).not.toBeNull();
      expect(project?.projectName).toBe('alice-public');
    });
  });

  describe('cross-user isolation', () => {
    test('Bob cannot read Alice\'s project', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-proj');
      expect(
        await t.withIdentity(BOB).query(api.projects.getProject, { projectName: 'alice-proj' })
      ).toBeNull();
    });

    test('Bob cannot delete Alice\'s project', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-proj');
      await expect(
        t.withIdentity(BOB).mutation(api.projects.deleteProject, { projectName: 'alice-proj' })
      ).rejects.toThrow();

      // Still there for Alice.
      expect(
        await t.withIdentity(ALICE).query(api.projects.getProject, { projectName: 'alice-proj' })
      ).not.toBeNull();
    });

    test('Bob cannot overwrite Alice\'s project', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-proj');
      await expect(
        t.withIdentity(BOB).mutation(api.projects.saveProject, {
          projectName: 'alice-proj',
          prompt: 'hijacked',
          status: 'completed',
          isPublished: false,
        })
      ).rejects.toThrow();
    });

    test('getUserProjects only returns the caller\'s own projects', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-one');
      await makeProject(t, ALICE, 'alice-two');
      await makeProject(t, BOB, 'bob-one');

      const bobProjects = await t.withIdentity(BOB).query(api.projects.getUserProjects, {});
      expect(bobProjects.map((p) => p.projectName)).toEqual(['bob-one']);
    });

    test('integration tokens are scoped per identity', async () => {
      const t = setup();
      await t
        .withIdentity(ALICE)
        .mutation(api.integrations.upsertIntegration, { githubAccessToken: 'alice-token' });

      const bobRecord = await t.withIdentity(BOB).query(api.integrations.getIntegration, {});
      expect(bobRecord).toBeNull();

      const aliceRecord = await t.withIdentity(ALICE).query(api.integrations.getIntegration, {});
      expect(aliceRecord?.githubAccessToken).toBe('alice-token');
    });

    test('BYOK settings are scoped per identity', async () => {
      const t = setup();
      await t.withIdentity(ALICE).mutation(api.aiSettings.upsertForUser, {
        adminConfigJson: '{}',
        byokConfigJson: '{"groq":"alice-key"}',
      });

      expect(await t.withIdentity(BOB).query(api.aiSettings.getForCurrentUser, {})).toBeNull();
    });
  });

  describe('project files', () => {
    test('Bob cannot overwrite the files of Alice\'s project', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-files');
      const project = await t
        .withIdentity(ALICE)
        .query(api.projects.getProject, { projectName: 'alice-files' });

      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId: project!._id,
        files: [
          { path: 'index.html', content: '<h1>mine</h1>', language: 'html', fileType: 'page' },
        ],
      });

      // saveFiles deletes anything not in the input list, so this is a destructive call.
      await expect(
        t.withIdentity(BOB).mutation(api.files.saveFiles, {
          projectId: project!._id,
          files: [],
        })
      ).rejects.toThrow();

      const files = await t
        .withIdentity(ALICE)
        .query(api.files.getFilesByProject, { projectId: project!._id });
      expect(files).toHaveLength(1);
    });

    test('files of an unpublished project are hidden from other users', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-hidden');
      const project = await t
        .withIdentity(ALICE)
        .query(api.projects.getProject, { projectName: 'alice-hidden' });

      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId: project!._id,
        files: [
          { path: 'index.html', content: '<h1>secret</h1>', language: 'html', fileType: 'page' },
        ],
      });

      expect(
        await t.withIdentity(BOB).query(api.files.getFilesByProject, { projectId: project!._id })
      ).toEqual([]);
      expect(await t.query(api.files.getFilesByProject, { projectId: project!._id })).toEqual([]);
    });

    test('files of a published project are readable anonymously', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-live');
      const project = await t
        .withIdentity(ALICE)
        .query(api.projects.getProject, { projectName: 'alice-live' });

      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId: project!._id,
        files: [
          { path: 'index.html', content: '<h1>hello</h1>', language: 'html', fileType: 'page' },
        ],
      });
      await t.withIdentity(ALICE).mutation(api.projects.publishProject, { projectName: 'alice-live' });

      const files = await t.query(api.files.getFilesByProject, { projectId: project!._id });
      expect(files).toHaveLength(1);
      expect(files[0].content).toBe('<h1>hello</h1>');
    });
  });

  describe('project metadata (the stored-XSS source)', () => {
    test('Bob cannot rewrite the SEO metadata of Alice\'s published site', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-seo');
      await t.withIdentity(ALICE).mutation(api.projects.publishProject, { projectName: 'alice-seo' });
      const project = await t
        .withIdentity(ALICE)
        .query(api.projects.getProject, { projectName: 'alice-seo' });

      await expect(
        t.withIdentity(BOB).mutation(api.projects.updateMetadata, {
          projectId: project!._id,
          favicon: '"><script>alert(1)</script>',
        })
      ).rejects.toThrow();
    });
  });

  describe('name reservation', () => {
    test('a second reservation of the same name fails, even for the same user', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'taken');

      expect(
        await t
          .withIdentity(BOB)
          .mutation(api.projects.reserveProjectName, { projectName: 'taken', prompt: 'x' })
      ).toBeNull();
      expect(
        await t
          .withIdentity(ALICE)
          .mutation(api.projects.reserveProjectName, { projectName: 'taken', prompt: 'x' })
      ).toBeNull();
    });

    test('projectNameTaken does not disclose anything beyond a boolean', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-secret-name');

      expect(
        await t.withIdentity(BOB).query(api.projects.projectNameTaken, { projectName: 'alice-secret-name' })
      ).toBe(true);
      expect(
        await t.withIdentity(BOB).query(api.projects.projectNameTaken, { projectName: 'free-name' })
      ).toBe(false);
    });
  });

  describe('admin gate', () => {
    test('a non-admin cannot write the global model config', async () => {
      const t = setup();
      await expect(
        t.withIdentity(ALICE).mutation(api.aiSettings.upsertAdminModelConfig, { configJson: '{}' })
      ).rejects.toThrow();
    });

    test('an admin can', async () => {
      const t = setup();
      await t
        .withIdentity(ADMIN)
        .mutation(api.aiSettings.upsertAdminModelConfig, { configJson: '{"ok":true}' });

      const row = await t.withIdentity(ALICE).query(api.aiSettings.getAdminModelConfig, {});
      expect(row?.configJson).toBe('{"ok":true}');
    });

    test('an allowlisted but unverified email is not an admin', async () => {
      const t = setup();
      await expect(
        t
          .withIdentity(UNVERIFIED_ADMIN)
          .mutation(api.aiSettings.upsertAdminModelConfig, { configJson: '{}' })
      ).rejects.toThrow();
    });

    test('fails closed when MAF_ADMIN_EMAILS is unset', async () => {
      delete process.env.MAF_ADMIN_EMAILS;
      const t = setup();
      await expect(
        t.withIdentity(ADMIN).mutation(api.aiSettings.upsertAdminModelConfig, { configJson: '{}' })
      ).rejects.toThrow();
    });

    test('a non-admin cannot read the audit log', async () => {
      const t = setup();
      await expect(t.withIdentity(ALICE).query(api.aiSettings.listAdminAudit, {})).rejects.toThrow();
    });

    test('audit entries record the acting admin, not a caller-supplied identity', async () => {
      const t = setup();
      await t
        .withIdentity(ADMIN)
        .mutation(api.aiSettings.addAdminAudit, { action: 'test.action', detailsJson: '{}' });

      const entries = await t.withIdentity(ADMIN).query(api.aiSettings.listAdminAudit, {});
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe(ADMIN.subject);
      expect(entries[0].email).toBe(ADMIN.email);
    });
  });

  describe('cascade delete', () => {
    test('deleting a project removes its files rather than stranding them', async () => {
      const t = setup();
      await makeProject(t, ALICE, 'alice-cascade');
      const project = await t
        .withIdentity(ALICE)
        .query(api.projects.getProject, { projectName: 'alice-cascade' });

      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId: project!._id,
        files: [
          { path: 'index.html', content: '<h1>x</h1>', language: 'html', fileType: 'page' },
          { path: 'styles.css', content: 'body{}', language: 'css', fileType: 'style' },
        ],
      });

      await t.withIdentity(ALICE).mutation(api.projects.deleteProject, { projectName: 'alice-cascade' });

      const orphanedFiles = await t.run(async (ctx) => ctx.db.query('projectFiles').collect());
      expect(orphanedFiles).toEqual([]);
    });
  });
});
