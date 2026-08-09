import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProjectAccessById } from "./auth";

/**
 * Deployment history, scoped to projects the caller may access. Both handlers were previously
 * open: anyone could insert unbounded rows, or read another user's deployment URLs and repo names.
 */

export const addDeploymentHistory = mutation({
  args: {
    projectId: v.id("projects"),
    provider: v.string(),
    deploymentUrl: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    netlifySiteName: v.optional(v.string()),
    cloudflareProjectName: v.optional(v.string()),
    cloudflareDeploymentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);

    return await ctx.db.insert("deploymentHistory", {
      projectId: args.projectId,
      provider: args.provider,
      deploymentUrl: args.deploymentUrl,
      repoUrl: args.repoUrl,
      netlifySiteName: args.netlifySiteName,
      cloudflareProjectName: args.cloudflareProjectName,
      cloudflareDeploymentId: args.cloudflareDeploymentId,
      createdAt: Date.now(),
    });
  },
});

export const getDeploymentHistory = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectAccessById(ctx, args.projectId);

    // Bounded: this table only grows, and an unpaginated collect() would eventually return every
    // deployment a long-lived project ever had.
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db
      .query("deploymentHistory")
      .withIndex("by_project_time", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(limit);
  },
});
