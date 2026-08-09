import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./auth";

/**
 * OAuth access tokens for GitHub, Vercel, and Netlify.
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
        githubConnectedAt?: number;
        vercelConnectedAt?: number;
        netlifyConnectedAt?: number;
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

      await ctx.db.patch(existing._id, {
        githubAccessToken: updates.githubAccessToken ?? existing.githubAccessToken,
        vercelAccessToken: updates.vercelAccessToken ?? existing.vercelAccessToken,
        netlifyAccessToken: updates.netlifyAccessToken ?? existing.netlifyAccessToken,
        githubConnectedAt: updates.githubConnectedAt ?? existing.githubConnectedAt,
        vercelConnectedAt: updates.vercelConnectedAt ?? existing.vercelConnectedAt,
        netlifyConnectedAt: updates.netlifyConnectedAt ?? existing.netlifyConnectedAt,
        updatedAt: updates.updatedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("userIntegrations", {
      userId,
      githubAccessToken: args.githubAccessToken,
      vercelAccessToken: args.vercelAccessToken,
      netlifyAccessToken: args.netlifyAccessToken,
      githubConnectedAt: args.githubAccessToken ? now : undefined,
      vercelConnectedAt: args.vercelAccessToken ? now : undefined,
      netlifyConnectedAt: args.netlifyAccessToken ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const clearIntegration = mutation({
  args: {
    provider: v.union(v.literal("github"), v.literal("vercel"), v.literal("netlify"), v.literal("all")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("userIntegrations")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!existing) return null;

    const updates: Record<string, undefined> = {};
    if (args.provider === "github" || args.provider === "all") {
      updates.githubAccessToken = undefined;
      updates.githubConnectedAt = undefined;
    }
    if (args.provider === "vercel" || args.provider === "all") {
      updates.vercelAccessToken = undefined;
      updates.vercelConnectedAt = undefined;
    }
    if (args.provider === "netlify" || args.provider === "all") {
      updates.netlifyAccessToken = undefined;
      updates.netlifyConnectedAt = undefined;
    }

    await ctx.db.patch(existing._id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return existing._id;
  },
});
