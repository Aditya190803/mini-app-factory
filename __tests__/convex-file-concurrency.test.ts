/// <reference types="vite/client" />
import { describe, test, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '@/convex/schema';
import { api } from '@/convex/_generated/api';

/**
 * Regression guard for the file-write data-loss bug.
 *
 * `saveFiles` deletes every path missing from its input, which makes any write built on a stale
 * snapshot destructive rather than merely out of date. Two things went wrong as a result:
 *
 *   1. The editor migrated `project.html` into files whenever the reactive projectFiles query came
 *      back empty — indistinguishable from "has not propagated yet". Racing a just-finished
 *      generation replaced every generated page with the two or three files derived from the
 *      legacy blob.
 *   2. Autosave and a concurrent transform could overwrite each other silently.
 *
 * These assert the fixes: migrateLegacyFiles never deletes, and saveFiles rejects a stale
 * expectedVersion.
 */

const modules = import.meta.glob('../convex/**/*.ts');
const ALICE = { subject: 'user_alice', email: 'alice@example.com', emailVerified: true };

const page = (path: string, content: string) => ({
  path,
  content,
  language: 'html' as const,
  fileType: 'page' as const,
});

async function newProject(t: ReturnType<typeof convexTest>, name: string) {
  await t.withIdentity(ALICE).mutation(api.projects.reserveProjectName, {
    projectName: name,
    prompt: 'test',
  });
  const project = await t.withIdentity(ALICE).query(api.projects.getProject, { projectName: name });
  return project!._id;
}

describe('file write concurrency', () => {
  describe('migrateLegacyFiles', () => {
    test('inserts when the project has no files yet', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'legacy-empty');

      const result = await t.withIdentity(ALICE).mutation(api.files.migrateLegacyFiles, {
        projectId,
        files: [page('index.html', '<h1>from legacy blob</h1>')],
      });

      expect(result.migrated).toBe(true);
      const files = await t.withIdentity(ALICE).query(api.files.getFilesByProject, { projectId });
      expect(files).toHaveLength(1);
    });

    test('is a no-op when files already exist — the wipe that used to happen', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'legacy-race');

      // Generation has written a multi-page project.
      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [
          page('index.html', '<h1>home</h1>'),
          page('about.html', '<h1>about</h1>'),
          page('contact.html', '<h1>contact</h1>'),
        ],
      });

      // The editor, having read an empty (not-yet-propagated) file list, tries to migrate.
      const result = await t.withIdentity(ALICE).mutation(api.files.migrateLegacyFiles, {
        projectId,
        files: [page('index.html', '<h1>legacy blob</h1>')],
      });

      expect(result.migrated).toBe(false);

      const files = await t.withIdentity(ALICE).query(api.files.getFilesByProject, { projectId });
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.path).sort()).toEqual(['about.html', 'contact.html', 'index.html']);
      // The surviving index.html is the generated one, not the legacy blob.
      expect(files.find((f) => f.path === 'index.html')?.content).toBe('<h1>home</h1>');
    });

    test('repeated calls stay a no-op', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'legacy-twice');

      await t.withIdentity(ALICE).mutation(api.files.migrateLegacyFiles, {
        projectId,
        files: [page('index.html', '<h1>first</h1>')],
      });
      const second = await t.withIdentity(ALICE).mutation(api.files.migrateLegacyFiles, {
        projectId,
        files: [page('index.html', '<h1>second</h1>')],
      });

      expect(second.migrated).toBe(false);
      const files = await t.withIdentity(ALICE).query(api.files.getFilesByProject, { projectId });
      expect(files.find((f) => f.path === 'index.html')?.content).toBe('<h1>first</h1>');
    });
  });

  describe('saveFiles optimistic concurrency', () => {
    test('advances filesVersion on every write', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'versioned');

      const first = await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'a')],
      });
      const second = await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'b')],
      });

      expect(second.filesVersion).toBe(first.filesVersion + 1);
    });

    test('accepts a write carrying the current version', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'version-ok');

      const first = await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'a')],
      });

      await expect(
        t.withIdentity(ALICE).mutation(api.files.saveFiles, {
          projectId,
          files: [page('index.html', 'b')],
          expectedVersion: first.filesVersion,
        })
      ).resolves.toBeTruthy();
    });

    test('rejects a stale write instead of silently deleting', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'version-stale');

      // Editor loads at this version.
      const loaded = await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'home'), page('about.html', 'about')],
      });

      // A transform writes in the meantime, adding a page.
      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'home'), page('about.html', 'about'), page('pricing.html', 'new')],
      });

      // The editor now saves its stale two-file snapshot. Without the version check this would
      // delete pricing.html.
      await expect(
        t.withIdentity(ALICE).mutation(api.files.saveFiles, {
          projectId,
          files: [page('index.html', 'edited'), page('about.html', 'about')],
          expectedVersion: loaded.filesVersion,
        })
      ).rejects.toThrow(/changed since they were loaded/);

      const files = await t.withIdentity(ALICE).query(api.files.getFilesByProject, { projectId });
      expect(files.map((f) => f.path).sort()).toEqual(['about.html', 'index.html', 'pricing.html']);
    });

    test('omitting expectedVersion still writes, so server callers are unaffected', async () => {
      const t = convexTest(schema, modules);
      const projectId = await newProject(t, 'version-optional');

      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'a'), page('b.html', 'b')],
      });
      await t.withIdentity(ALICE).mutation(api.files.saveFiles, {
        projectId,
        files: [page('index.html', 'c')],
      });

      const files = await t.withIdentity(ALICE).query(api.files.getFilesByProject, { projectId });
      expect(files).toHaveLength(1);
    });
  });
});
