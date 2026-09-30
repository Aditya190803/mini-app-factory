import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getProjectRole, getUserId, requireProjectAccessById, requireUserId } from "./auth";

/**
 * Project file contents.
 *
 * Every handler resolves the parent project and checks access before touching a row — the tables
 * are keyed by `projectId`, and a bare `projectId` argument is not evidence of ownership. Before
 * this, `saveFiles` would happily rewrite or delete every file of any project it was pointed at.
 *
 * Anonymous rendering uses the projected `getPublished*` queries below, which never expose
 * database IDs, ownership, or timestamps.
 */

/**
 * Size caps. The Next.js routes validate too, but these mutations are callable directly with a
 * user's token, so the limits have to hold here. A single file must also stay under Convex's
 * 1 MiB document limit.
 */
export const MAX_FILES_PER_PROJECT = 300;
export const MAX_FILE_BYTES = 800_000;
export const MAX_PROJECT_BYTES = 8_000_000;

function assertFileSize(path: string, content: string) {
  if (path.length > 500) throw new Error("File path is too long");
  if (content.length > MAX_FILE_BYTES) throw new Error(`${path} is too large (limit ${MAX_FILE_BYTES} bytes)`);
}

async function bumpFilesVersion(ctx: MutationCtx, projectId: Id<"projects">, patch: { pageCount?: number } = {}) {
  const project = await ctx.db.get(projectId);
  if (!project) return 0;
  const filesVersion = (project.filesVersion ?? 0) + 1;
  await ctx.db.patch(projectId, { ...patch, filesVersion, updatedAt: Date.now() });
  return filesVersion;
}

/** Full records are available to any project member. */
export const getFilesByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!(await getProjectRole(ctx, project, await getUserId(ctx)))) return [];

    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

/**
 * Files and the version they belong to, read in one transaction. Server-side writers (the
 * transform) save against this version, so edits that land while they run are not overwritten.
 */
export const getFilesSnapshot = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await getProjectRole(ctx, project, await getUserId(ctx)))) return null;
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return { files, filesVersion: project.filesVersion ?? 0 };
  },
});

export const getFileByPath = query({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!(await getProjectRole(ctx, project, await getUserId(ctx)))) return null;

    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();
  },
});

export const getPublishedFiles = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    if (!project?.isPublished) return [];

    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    return files.map(({ path, content, language, fileType }) => ({
      path,
      content,
      language,
      fileType,
    }));
  },
});

export const getPublishedFile = query({
  args: { projectName: v.string(), path: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    if (!project?.isPublished) return null;

    const file = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", project._id).eq("path", args.path)
      )
      .first();
    if (!file) return null;
    return {
      path: file.path,
      content: file.content,
      language: file.language,
      fileType: file.fileType,
    };
  },
});

export const saveFile = mutation({
  args: {
    projectId: v.id("projects"),
    path: v.string(),
    content: v.string(),
    language: v.union(
      v.literal("html"),
      v.literal("css"),
      v.literal("javascript"),
      v.literal("sql"),
      v.literal("json")
    ),
    fileType: v.union(
      v.literal("page"),
      v.literal("html"),
      v.literal("partial"),
      v.literal("style"),
      v.literal("script"),
      v.literal("worker"),
      v.literal("migration"),
      v.literal("config")
    ),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectAccessById(ctx, args.projectId);
    assertFileSize(args.path, args.content);

    const normalizedFileType = args.fileType === "html" ? "page" : args.fileType;
    const existing = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();

    const now = Date.now();
    let fileId = existing?._id;
    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        language: args.language,
        fileType: normalizedFileType,
        updatedAt: now,
      });
    } else {
      fileId = await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        path: args.path,
        content: args.content,
        language: args.language,
        fileType: normalizedFileType,
        createdAt: now,
        updatedAt: now,
      });
    }
    // Bump the version on every write, not just inserts: a tab holding the old version must not
    // be able to overwrite this change with a stale snapshot.
    const pageCount = !existing && normalizedFileType === "page" ? (project.pageCount || 0) + 1 : undefined;
    const filesVersion = await bumpFilesVersion(ctx, args.projectId, pageCount === undefined ? {} : { pageCount });
    return { fileId, filesVersion };
  },
});

export const saveFiles = mutation({
  args: {
    projectId: v.id("projects"),
    files: v.array(
      v.object({
        path: v.string(),
        content: v.string(),
        language: v.union(
          v.literal("html"),
          v.literal("css"),
          v.literal("javascript"),
          v.literal("sql"),
          v.literal("json")
        ),
        fileType: v.union(
          v.literal("page"),
          v.literal("html"),
          v.literal("partial"),
          v.literal("style"),
          v.literal("script"),
          v.literal("worker"),
          v.literal("migration"),
          v.literal("config")
        ),
      })
    ),
    /**
     * The filesVersion the caller last read. When supplied and stale, the write is rejected
     * instead of applied. Optional so existing server-side callers keep working, but any caller
     * that holds a snapshot across time (the editor's autosave, the transform delta apply) should
     * pass it — this mutation deletes every path missing from `files`, so a stale write is a
     * silent data loss rather than a merge conflict.
     */
    expectedVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectAccessById(ctx, args.projectId);
    if (args.files.length > MAX_FILES_PER_PROJECT) throw new Error(`Projects are limited to ${MAX_FILES_PER_PROJECT} files`);
    let totalBytes = 0;
    for (const file of args.files) {
      assertFileSize(file.path, file.content);
      totalBytes += file.content.length;
    }
    if (totalBytes > MAX_PROJECT_BYTES) throw new Error(`Projects are limited to ${MAX_PROJECT_BYTES} bytes of files`);

    const currentVersion = project.filesVersion ?? 0;
    if (args.expectedVersion !== undefined && args.expectedVersion !== currentVersion) {
      throw new Error(
        `Project files changed since they were loaded (expected v${args.expectedVersion}, now v${currentVersion}). Reload before saving.`
      );
    }

    const now = Date.now();
    let pageCount = 0;

    // Get existing files to identify which ones to delete
    const existingFiles = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const inputPaths = new Set(args.files.map(f => f.path));

    // Delete files that are no longer in the input list
    for (const existing of existingFiles) {
      if (!inputPaths.has(existing.path)) {
        await ctx.db.delete(existing._id);
      }
    }

    // Update or insert provided files
    for (const file of args.files) {
      const normalizedFileType =
        file.fileType === "html" ? "page" : file.fileType;
      const existing = existingFiles.find(f => f.path === file.path);

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: file.content,
          language: file.language,
          fileType: normalizedFileType,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("projectFiles", {
          projectId: args.projectId,
          path: file.path,
          content: file.content,
          language: file.language,
          fileType: normalizedFileType,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (normalizedFileType === "page") pageCount++;
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
      pageCount: pageCount,
      filesVersion: currentVersion + 1,
    });

    return { filesVersion: currentVersion + 1 };
  },
});

/**
 * Move a legacy `project.html` blob into the projectFiles table, once.
 *
 * The editor used to do this client-side: if the reactive projectFiles query came back empty it
 * ran the migration and called `saveFiles`. But "empty" is indistinguishable from "the query has
 * not propagated yet", and `saveFiles` deletes every path missing from its input — so immediately
 * after generation, a briefly-empty read would replace all the generated pages and partials with
 * the one-to-three files derived from the legacy blob.
 *
 * Doing it here fixes that by construction: the emptiness check and the insert happen in one
 * transaction, and this mutation only ever inserts. If files already exist it is a no-op, so a
 * late or duplicated call is harmless.
 */
export const migrateLegacyFiles = mutation({
  args: {
    projectId: v.id("projects"),
    files: v.array(
      v.object({
        path: v.string(),
        content: v.string(),
        language: v.union(
          v.literal("html"),
          v.literal("css"),
          v.literal("javascript"),
          v.literal("sql"),
          v.literal("json")
        ),
        fileType: v.union(
          v.literal("page"),
          v.literal("html"),
          v.literal("partial"),
          v.literal("style"),
          v.literal("script"),
          v.literal("worker"),
          v.literal("migration"),
          v.literal("config")
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectAccessById(ctx, args.projectId);

    const existing = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      // Already migrated, or the caller raced a real write. Either way, do not touch anything.
      return { migrated: false, filesVersion: project.filesVersion ?? 0 };
    }

    const now = Date.now();
    let pageCount = 0;
    for (const file of args.files) {
      const normalizedFileType = file.fileType === "html" ? "page" : file.fileType;
      await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        path: file.path,
        content: file.content,
        language: file.language,
        fileType: normalizedFileType,
        createdAt: now,
        updatedAt: now,
      });
      if (normalizedFileType === "page") pageCount++;
    }

    const nextVersion = (project.filesVersion ?? 0) + 1;
    await ctx.db.patch(args.projectId, {
      updatedAt: now,
      pageCount,
      filesVersion: nextVersion,
    });

    return { migrated: true, filesVersion: nextVersion };
  },
});

export const recordEdit = mutation({
  args: {
    projectId: v.id("projects"),
    fileId: v.id("projectFiles"),
    operation: v.string(),
    previousContent: v.string(),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);
    const userId = await requireUserId(ctx);
    const file = await ctx.db.get(args.fileId);
    if (!file || file.projectId !== args.projectId) {
      throw new Error("File not found");
    }

    await ctx.db.insert("editHistory", {
      projectId: args.projectId,
      fileId: args.fileId,
      operation: args.operation,
      previousContent: args.previousContent,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteFile = mutation({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectAccessById(ctx, args.projectId);

    const existing = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();

    if (!existing) return { filesVersion: project.filesVersion ?? 0 };
    await ctx.db.delete(existing._id);
    const filesVersion = await bumpFilesVersion(
      ctx,
      args.projectId,
      existing.fileType === "page" ? { pageCount: Math.max(0, (project.pageCount || 1) - 1) } : {}
    );
    return { filesVersion };
  },
});
