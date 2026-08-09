import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin, requireUserId } from './auth';

/**
 * Per-user AI settings (BYOK provider keys, custom models) and the global admin model config.
 *
 * Ownership comes from the verified identity, never from an argument. `getByUserId` used to take a
 * `userId` and return that user's row, which made every BYOK provider key readable by anyone who
 * could reach the deployment. The key blob is also encrypted at rest by the Next.js layer
 * (lib/secret-box.ts), so this layer only ever handles ciphertext.
 */

export const getForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();
  },
});

export const upsertForUser = mutation({
  args: {
    adminConfigJson: v.string(),
    byokConfigJson: v.string(),
    customModelsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        adminConfigJson: args.adminConfigJson,
        byokConfigJson: args.byokConfigJson,
        updatedAt: now,
      };
      if (args.customModelsJson !== undefined) {
        patch.customModelsJson = args.customModelsJson;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert('aiSettings', {
      userId,
      adminConfigJson: args.adminConfigJson,
      byokConfigJson: args.byokConfigJson,
      customModelsJson: args.customModelsJson,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- Global admin model config (singleton) ---

/**
 * Readable by any signed-in user — the client needs it to filter the model picker. It contains
 * provider enable/disable state and model ids, no secrets.
 */
export const getAdminModelConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const rows = await ctx.db.query('adminModelConfig').order('desc').take(1);
    return rows[0] ?? null;
  },
});

export const upsertAdminModelConfig = mutation({
  args: {
    configJson: v.string(),
  },
  handler: async (ctx, args) => {
    // Writing this affects every user, so it is admin-only and the identity is recorded here
    // rather than accepted as an `updatedBy` argument.
    const { userId } = await requireAdmin(ctx);
    const now = Date.now();
    const rows = await ctx.db.query('adminModelConfig').order('desc').take(1);
    const existing = rows[0];

    if (existing) {
      await ctx.db.patch(existing._id, {
        configJson: args.configJson,
        updatedBy: userId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('adminModelConfig', {
      configJson: args.configJson,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- User custom models ---

export const updateUserCustomModels = mutation({
  args: {
    customModelsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        customModelsJson: args.customModelsJson,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('aiSettings', {
      userId,
      adminConfigJson: '{}',
      byokConfigJson: '{}',
      customModelsJson: args.customModelsJson,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- Admin audit log ---

export const addAdminAudit = mutation({
  args: {
    action: v.string(),
    detailsJson: v.string(),
  },
  handler: async (ctx, args) => {
    // Actor identity is taken from the token, so entries cannot be forged or attributed to someone
    // else — which was possible when userId and email were plain arguments.
    const { userId, email } = await requireAdmin(ctx);
    return await ctx.db.insert('aiAdminAudit', {
      userId,
      email,
      action: args.action,
      detailsJson: args.detailsJson,
      createdAt: Date.now(),
    });
  },
});

/**
 * The full audit log across all admins, newest first.
 *
 * Previously this was scoped by userId, so an admin could only ever see their own actions and a
 * second admin's changes were invisible. The `by_time` index existed for this and was unused.
 */
export const listAdminAudit = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db.query('aiAdminAudit').withIndex('by_time').order('desc').take(limit);
  },
});
