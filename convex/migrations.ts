import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

/**
 * One-off data migrations. Run from the Convex dashboard (Functions → migrations), or:
 *
 *   npx convex run migrations:backfillLegacyProjects
 *   npx convex run migrations:clearVercelTokens
 *
 * Both are idempotent and schedule themselves until done. Once both report `done: true` on the
 * production deployment, the legacy fields (`projects.html`, `pages`, `global*`,
 * `userIntegrations.vercelAccessToken`), lib/migration.ts and the editor's client-side migration
 * path can be deleted, along with the schema fields.
 */

const BATCH = 25;

/**
 * Give every legacy project (content only in `html`/`pages`) real projectFiles, then drop the
 * legacy fields. The HTML is copied as-is into index.html; the editor's old migration also split
 * inline CSS and JS into files, which is cosmetic and can be done afterwards by the AI.
 */
export const backfillLegacyProjects = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('projects').paginate({ cursor: cursor ?? null, numItems: BATCH });
    let migrated = 0;
    let cleared = 0;
    for (const project of page.page) {
      const legacyHtml = project.html ?? project.pages?.find((page) => page.isHomePage)?.html ?? project.pages?.[0]?.html;
      const hasLegacy = project.html !== undefined || project.pages !== undefined || project.globalCss !== undefined || project.globalJs !== undefined || project.globalHeader !== undefined || project.globalFooter !== undefined;
      if (!hasLegacy) continue;

      const firstFile = await ctx.db.query('projectFiles').withIndex('by_project', (q) => q.eq('projectId', project._id)).first();
      if (!firstFile && legacyHtml) {
        const now = Date.now();
        await ctx.db.insert('projectFiles', { projectId: project._id, path: 'index.html', content: legacyHtml, language: 'html', fileType: 'page', createdAt: now, updatedAt: now });
        if (project.globalCss) {
          await ctx.db.insert('projectFiles', { projectId: project._id, path: 'styles.css', content: project.globalCss, language: 'css', fileType: 'style', createdAt: now, updatedAt: now });
        }
        if (project.globalJs) {
          await ctx.db.insert('projectFiles', { projectId: project._id, path: 'script.js', content: project.globalJs, language: 'javascript', fileType: 'script', createdAt: now, updatedAt: now });
        }
        migrated++;
      }
      // Only drop the legacy fields once the project has files to show instead.
      if (firstFile || legacyHtml) {
        await ctx.db.patch(project._id, {
          html: undefined,
          pages: undefined,
          globalCss: undefined,
          globalJs: undefined,
          globalHeader: undefined,
          globalFooter: undefined,
          filesVersion: (project.filesVersion ?? 0) + 1,
        });
        cleared++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillLegacyProjects, { cursor: page.continueCursor });
    }
    return { migrated, cleared, done: page.isDone };
  },
});

/** Vercel was removed as a deploy target; its stored tokens serve no purpose. */
export const clearVercelTokens = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('userIntegrations').paginate({ cursor: cursor ?? null, numItems: 100 });
    let cleared = 0;
    for (const row of page.page) {
      if (row.vercelAccessToken === undefined && row.vercelConnectedAt === undefined) continue;
      await ctx.db.patch(row._id, { vercelAccessToken: undefined, vercelConnectedAt: undefined });
      cleared++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.clearVercelTokens, { cursor: page.continueCursor });
    return { cleared, done: page.isDone };
  },
});
