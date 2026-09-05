import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./auth";

const language = v.union(v.literal("html"), v.literal("css"), v.literal("javascript"), v.literal("sql"), v.literal("json"));
const fileType = v.union(v.literal("page"), v.literal("partial"), v.literal("style"), v.literal("script"), v.literal("worker"), v.literal("migration"), v.literal("config"));

function cleanName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error("Component name must be between 1 and 80 characters");
  return name;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.query("savedComponents").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").collect();
  },
});

export const save = mutation({
  args: { name: v.string(), description: v.optional(v.string()), path: v.string(), content: v.string(), language, fileType },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const name = cleanName(args.name);
    if (!args.path.trim() || args.path.length > 300) throw new Error("Invalid component path");
    if (args.content.length > 500_000) throw new Error("Components are limited to 500 KB");
    const existing = await ctx.db.query("savedComponents").withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name)).first();
    const now = Date.now();
    const values = { name, description: args.description?.trim().slice(0, 500), path: args.path, content: args.content, language: args.language, fileType: args.fileType, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return await ctx.db.insert("savedComponents", { userId, ...values, createdAt: now });
  },
});

export const remove = mutation({
  args: { componentId: v.id("savedComponents") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const component = await ctx.db.get(args.componentId);
    if (!component || component.userId !== userId) throw new Error("Component not found");
    await ctx.db.delete(args.componentId);
  },
});
