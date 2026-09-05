import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canReadProject, getUserId, requireProjectAccessById, requireUserId } from "./auth";

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

/** Full records are available only to the project owner. */
export const getFilesByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const userId = await getUserId(ctx);
    if (!(await canReadProject(ctx, project, userId))) return [];

    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getFileByPath = query({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const userId = await getUserId(ctx);
    if (!(await canReadProject(ctx, project, userId))) return null;

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
    await requireProjectAccessById(ctx, args.projectId);

    const normalizedFileType = args.fileType === "html" ? "page" : args.fileType;
    const existing = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        language: args.language,
        fileType: normalizedFileType,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const fileId = await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        path: args.path,
        content: args.content,
        language: args.language,
        fileType: normalizedFileType,
        createdAt: now,
        updatedAt: now,
      });

      // Update project updated time and page count if it's a page
      const project = await ctx.db.get(args.projectId);
      if (project) {
        const patch: { updatedAt: number; pageCount?: number } = { updatedAt: now };
        if (normalizedFileType === "page") {
          patch.pageCount = (project.pageCount || 0) + 1;
        }
        await ctx.db.patch(args.projectId, patch);
      }

      return fileId;
    }
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
    await requireProjectAccessById(ctx, args.projectId);

    const existing = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);

      const project = await ctx.db.get(args.projectId);
      if (project && existing.fileType === "page") {
        await ctx.db.patch(args.projectId, {
          pageCount: Math.max(0, (project.pageCount || 1) - 1),
          updatedAt: Date.now(),
        });
      }
    }
  },
});
