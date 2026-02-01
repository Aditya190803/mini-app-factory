import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getFilesByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getFileByPath = query({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectFiles")
      .withIndex("by_project_path", (q) =>
        q.eq("projectId", args.projectId).eq("path", args.path)
      )
      .first();
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
      v.literal("javascript")
    ),
    fileType: v.union(
      v.literal("page"),
      v.literal("partial"),
      v.literal("style"),
      v.literal("script")
    ),
  },
  handler: async (ctx, args) => {
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
        fileType: args.fileType,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const fileId = await ctx.db.insert("projectFiles", {
        projectId: args.projectId,
        path: args.path,
        content: args.content,
        language: args.language,
        fileType: args.fileType,
        createdAt: now,
        updatedAt: now,
      });
      
      // Update project updated time and page count if it's a page
      const project = await ctx.db.get(args.projectId);
      if (project) {
        const patch: { updatedAt: number; pageCount?: number } = { updatedAt: now };
        if (args.fileType === "page") {
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
          v.literal("javascript")
        ),
        fileType: v.union(
          v.literal("page"),
          v.literal("partial"),
          v.literal("style"),
          v.literal("script")
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let pageCount = 0;
    
    for (const file of args.files) {
      const existing = await ctx.db
        .query("projectFiles")
        .withIndex("by_project_path", (q) =>
          q.eq("projectId", args.projectId).eq("path", file.path)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: file.content,
          language: file.language,
          fileType: file.fileType,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("projectFiles", {
          projectId: args.projectId,
          path: file.path,
          content: file.content,
          language: file.language,
          fileType: file.fileType,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (file.fileType === "page") pageCount++;
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: now,
      pageCount: pageCount, // Reset or update page count
    });
  },
});

export const recordEdit = mutation({
  args: {
    projectId: v.id("projects"),
    fileId: v.id("projectFiles"),
    operation: v.string(),
    previousContent: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("editHistory", {
      projectId: args.projectId,
      fileId: args.fileId,
      operation: args.operation,
      previousContent: args.previousContent,
      userId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteFile = mutation({
  args: { projectId: v.id("projects"), path: v.string() },
  handler: async (ctx, args) => {
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
