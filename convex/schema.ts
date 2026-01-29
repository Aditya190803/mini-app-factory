import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    projectName: v.string(),
    prompt: v.string(),
    html: v.optional(v.string()),
    status: v.string(),
    userId: v.optional(v.string()),
    isPublished: v.boolean(),
    createdAt: v.number(),
  }).index("by_projectName", ["projectName"])
    .index("by_userId", ["userId"]),
});
