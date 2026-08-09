import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./auth";

/**
 * Convex file storage helpers.
 *
 * Both required sign-in as of the authorization pass — `generateUploadUrl` was public and
 * unmetered, so anyone could push arbitrary content into the deployment's storage indefinitely.
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = query({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});
