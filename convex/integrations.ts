import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./auth";

/**
 * Access tokens for GitHub, Vercel, Netlify, and Cloudflare.
 *
 * Every handler here scopes to the caller's own identity via `requireUserId` — there is
 * deliberately no `userId` argument. These functions previously accepted one, which meant reading
 * any user's `repo`-scoped GitHub token was a single unauthenticated query away.
 *
 * Token values are additionally encrypted at rest by the Next.js layer (see lib/secret-box.ts);
 * this layer never sees plaintext.
 */

export const getIntegration = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("userIntegrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const upsertIntegration = mutation({
  args: {
    githubAccessToken: v.optional(v.string()),
    vercelAccessToken: v.optional(v.string()),
    netlifyAccessToken: v.optional(v.string()),
    cloudflareApiToken: v.optional(v.string()),
    cloudflareTokenId: v.optional(v.string()),
    cloudflareAccountId: v.optional(v.string()),
    cloudflareAccountName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();
    if (existing) {
      const updates: {
        githubAccessToken?: string;
        vercelAccessToken?: string;
        netlifyAccessToken?: string;
        cloudflareApiToken?: string;
        cloudflareTokenId?: string;
        cloudflareAccountId?: string;
        cloudflareAccountName?: string;
        githubConnectedAt?: number;
        vercelConnectedAt?: number;
        netlifyConnectedAt?: number;
        cloudflareConnectedAt?: number;
        updatedAt: number;
      } = { updatedAt: now };

      if (args.githubAccessToken !== undefined) {
        updates.githubAccessToken = args.githubAccessToken;
        updates.githubConnectedAt = now;
      }
      if (args.vercelAccessToken !== undefined) {
        updates.vercelAccessToken = args.vercelAccessToken;
        updates.vercelConnectedAt = now;
      }
      if (args.netlifyAccessToken !== undefined) {
        updates.netlifyAccessToken = args.netlifyAccessToken;
        updates.netlifyConnectedAt = now;
      }
      if (args.cloudflareApiToken !== undefined) {
        updates.cloudflareApiToken = args.cloudflareApiToken;
        updates.cloudflareTokenId = args.cloudflareTokenId;
        updates.cloudflareAccountId = args.cloudflareAccountId;
        updates.cloudflareAccountName = args.cloudflareAccountName;
        updates.cloudflareConnectedAt = now;
      }

      await ctx.db.patch(existing._id, {
        githubAccessToken: updates.githubAccessToken ?? existing.githubAccessToken,
        vercelAccessToken: updates.vercelAccessToken ?? existing.vercelAccessToken,
        netlifyAccessToken: updates.netlifyAccessToken ?? existing.netlifyAccessToken,
        cloudflareApiToken: updates.cloudflareApiToken ?? existing.cloudflareApiToken,
        cloudflareTokenId: updates.cloudflareTokenId ?? existing.cloudflareTokenId,
        cloudflareAccountId: updates.cloudflareAccountId ?? existing.cloudflareAccountId,
        cloudflareAccountName: updates.cloudflareAccountName ?? existing.cloudflareAccountName,
        githubConnectedAt: updates.githubConnectedAt ?? existing.githubConnectedAt,
        vercelConnectedAt: updates.vercelConnectedAt ?? existing.vercelConnectedAt,
        netlifyConnectedAt: updates.netlifyConnectedAt ?? existing.netlifyConnectedAt,
        cloudflareConnectedAt: updates.cloudflareConnectedAt ?? existing.cloudflareConnectedAt,
        updatedAt: updates.updatedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("userIntegrations", {
      userId,
      githubAccessToken: args.githubAccessToken,
      vercelAccessToken: args.vercelAccessToken,
      netlifyAccessToken: args.netlifyAccessToken,
      cloudflareApiToken: args.cloudflareApiToken,
      cloudflareTokenId: args.cloudflareTokenId,
      cloudflareAccountId: args.cloudflareAccountId,
      cloudflareAccountName: args.cloudflareAccountName,
      githubConnectedAt: args.githubAccessToken ? now : undefined,
      vercelConnectedAt: args.vercelAccessToken ? now : undefined,
      netlifyConnectedAt: args.netlifyAccessToken ? now : undefined,
      cloudflareConnectedAt: args.cloudflareApiToken ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const clearIntegration = mutation({
  args: {
    provider: v.union(
      v.literal("github"),
      v.literal("vercel"),
      v.literal("netlify"),
      v.literal("cloudflare"),
      v.literal("all")
    ),
    expectedGithubAccessToken: v.optional(v.string()),
    expectedVercelAccessToken: v.optional(v.string()),
    expectedNetlifyAccessToken: v.optional(v.string()),
    expectedCloudflareApiToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!existing) return null;

    const updates: Record<string, undefined> = {};
    const targets = (provider: "github" | "vercel" | "netlify" | "cloudflare") =>
      args.provider === provider || args.provider === "all";

    if (targets("github") && existing.githubAccessToken === args.expectedGithubAccessToken) {
      updates.githubAccessToken = undefined;
      updates.githubConnectedAt = undefined;
    }
    if (targets("vercel") && existing.vercelAccessToken === args.expectedVercelAccessToken) {
      updates.vercelAccessToken = undefined;
      updates.vercelConnectedAt = undefined;
    }
    if (targets("netlify") && existing.netlifyAccessToken === args.expectedNetlifyAccessToken) {
      updates.netlifyAccessToken = undefined;
      updates.netlifyConnectedAt = undefined;
    }
    if (targets("cloudflare") && existing.cloudflareApiToken === args.expectedCloudflareApiToken) {
      updates.cloudflareApiToken = undefined;
      updates.cloudflareTokenId = undefined;
      updates.cloudflareAccountId = undefined;
      updates.cloudflareAccountName = undefined;
      updates.cloudflareConnectedAt = undefined;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(existing._id, {
        ...updates,
        updatedAt: Date.now(),
      });
    }

    return existing._id;
  },
});
