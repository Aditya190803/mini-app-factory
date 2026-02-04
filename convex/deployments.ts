import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const addDeploymentHistory = mutation({
  args: {
    projectId: v.id("projects"),
    provider: v.string(),
    deploymentUrl: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    netlifySiteName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deploymentHistory", {
      projectId: args.projectId,
      provider: args.provider,
      deploymentUrl: args.deploymentUrl,
      repoUrl: args.repoUrl,
      netlifySiteName: args.netlifySiteName,
      createdAt: Date.now(),
    });
  },
});

export const getDeploymentHistory = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deploymentHistory")
      .withIndex("by_project_time", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});
