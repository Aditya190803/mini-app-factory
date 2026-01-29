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
    status: v.string(),
    userId: v.optional(v.string()),
    isPublished: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

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
        createdAt: Date.now(),
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
