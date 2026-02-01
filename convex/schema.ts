import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Updated projects table
  projects: defineTable({
    projectName: v.string(),
    prompt: v.string(),
    html: v.optional(v.string()), // Kept for migration, will be removed later
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error")
    ),
    userId: v.optional(v.string()),
    isPublished: v.boolean(),
    isMultiPage: v.optional(v.boolean()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()),
    // Legacy fields for migration/compatibility
    globalCss: v.optional(v.string()),
    globalJs: v.optional(v.string()),
    globalHeader: v.optional(v.string()),
    globalFooter: v.optional(v.string()),
    pages: v.optional(v.any()),
    favicon: v.optional(v.string()), // URL or Emoji
    globalSeo: v.optional(v.object({
      siteName: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    })),
    seoData: v.optional(v.array(v.object({
      path: v.string(), // file path e.g. "index.html"
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    }))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectName", ["projectName"])
    .index("by_userId", ["userId"])
    .index("by_userId_updated", ["userId", "updatedAt"]),

  // NEW: Separate files table
  projectFiles: defineTable({
    projectId: v.id("projects"),
    path: v.string(),
    content: v.string(),
    language: v.union(
      v.literal("html"),
      v.literal("css"),
      v.literal("javascript")
    ),
    fileType: v.union(
      v.literal("page"),
      v.literal("partial"),
      v.literal("style"),
      v.literal("script")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_path", ["projectId", "path"]),

  // NEW: Edit history for undo/redo
  editHistory: defineTable({
    projectId: v.id("projects"),
    fileId: v.id("projectFiles"),
    operation: v.string(),           // JSON stringified edit operation
    previousContent: v.string(),     // For undo
    createdAt: v.number(),
    userId: v.optional(v.string()),
  })
    .index("by_file", ["fileId"])
    .index("by_project_time", ["projectId", "createdAt"]),
});
