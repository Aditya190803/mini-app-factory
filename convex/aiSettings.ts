import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();
  },
});

export const upsertForUser = mutation({
  args: {
    userId: v.string(),
    adminConfigJson: v.string(),
    byokConfigJson: v.string(),
    customModelsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
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
      userId: args.userId,
      adminConfigJson: args.adminConfigJson,
      byokConfigJson: args.byokConfigJson,
      customModelsJson: args.customModelsJson,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- Global admin model config (singleton) ---

export const getAdminModelConfig = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('adminModelConfig').order('desc').take(1);
    return rows[0] ?? null;
  },
});

export const upsertAdminModelConfig = mutation({
  args: {
    configJson: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db.query('adminModelConfig').order('desc').take(1);
    const existing = rows[0];

    if (existing) {
      await ctx.db.patch(existing._id, {
        configJson: args.configJson,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('adminModelConfig', {
      configJson: args.configJson,
      updatedBy: args.updatedBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// --- User custom models ---

export const updateUserCustomModels = mutation({
  args: {
    userId: v.string(),
    customModelsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('aiSettings')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        customModelsJson: args.customModelsJson,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('aiSettings', {
      userId: args.userId,
      adminConfigJson: '{}',
      byokConfigJson: '{}',
      customModelsJson: args.customModelsJson,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const addAdminAudit = mutation({
  args: {
    userId: v.string(),
    email: v.string(),
    action: v.string(),
    detailsJson: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('aiAdminAudit', {
      userId: args.userId,
      email: args.email,
      action: args.action,
      detailsJson: args.detailsJson,
      createdAt: Date.now(),
    });
  },
});

export const listAdminAuditByUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db
      .query('aiAdminAudit')
      .withIndex('by_user_time', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(limit);
  },
});
