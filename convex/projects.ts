import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getProject = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
  },
});

export const saveProject = mutation({
  args: {
    projectName: v.string(),
    prompt: v.string(),
    html: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error")
    ),
    userId: v.optional(v.string()),
    isPublished: v.boolean(),
    isMultiPage: v.optional(v.boolean()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    const now = Date.now();
    if (existing) {
      if (existing.userId && existing.userId !== args.userId) {
        throw new Error("Unauthorized to edit this project");
      }
      await ctx.db.patch(existing._id, {
        prompt: args.prompt,
        html: args.html,
        status: args.status,
        userId: args.userId ?? existing.userId,
        isPublished: args.isPublished,
        isMultiPage: args.isMultiPage ?? existing.isMultiPage ?? false,
        pageCount: args.pageCount ?? existing.pageCount ?? 0,
        description: args.description ?? existing.description,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("projects", {
        projectName: args.projectName,
        prompt: args.prompt,
        html: args.html,
        status: args.status,
        userId: args.userId,
        isPublished: args.isPublished,
        isMultiPage: args.isMultiPage ?? false,
        pageCount: args.pageCount ?? 0,
        description: args.description,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const publishProject = mutation({
  args: {
    projectName: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    if (!project) throw new Error("Project not found");
    if (project.userId && project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(project._id, {
      isPublished: true,
      userId: args.userId,
    });
  },
});

export const updateMetadata = mutation({
  args: {
    projectId: v.id("projects"),
    favicon: v.optional(v.string()),
    globalSeo: v.optional(v.object({
      siteName: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    })),
    seoData: v.optional(v.array(v.object({
      path: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    
    await ctx.db.patch(args.projectId, {
      favicon: args.favicon !== undefined ? args.favicon : project.favicon,
      globalSeo: args.globalSeo !== undefined ? args.globalSeo : project.globalSeo,
      seoData: args.seoData !== undefined ? args.seoData : project.seoData,
      updatedAt: Date.now(),
    });
  },
});

export const getUserProjects = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

export const deleteProject = mutation({
  args: {
    projectName: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    if (!project) throw new Error("Project not found");
    if (project.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(project._id);
  },
});
