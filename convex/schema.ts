import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Updated projects table
  projects: defineTable({
    projectName: v.string(),
    prompt: v.string(),
    html: v.optional(v.string()), // Kept for migration, will be removed later
    pages: v.optional(v.array(v.object({
      html: v.string(),
      isHomePage: v.optional(v.boolean()),
      order: v.optional(v.number()),
      slug: v.optional(v.string()),
      title: v.optional(v.string()),
    }))),
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
    referenceUrl: v.optional(v.string()),
    projectInstructions: v.optional(v.string()),
    selectedModel: v.optional(v.string()),
    providerId: v.optional(v.string()),
    // Legacy fields for migration/compatibility
    globalCss: v.optional(v.string()),
    globalJs: v.optional(v.string()),
    globalHeader: v.optional(v.string()),
    globalFooter: v.optional(v.string()),
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
    deploymentUrl: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    deployProvider: v.optional(v.string()),
    deployedAt: v.optional(v.number()),
    netlifySiteName: v.optional(v.string()),
    cloudflareProjectName: v.optional(v.string()),
    cloudflareDeploymentId: v.optional(v.string()),
    cloudflareD1DatabaseId: v.optional(v.string()),
    cloudflareD1DatabaseName: v.optional(v.string()),
    cloudflareCustomDomain: v.optional(v.string()),
    cloudflareEnvVarsEncrypted: v.optional(v.string()),
    cloudflareResourcesJson: v.optional(v.string()),
    cloudflarePreviewProjectName: v.optional(v.string()),
    cloudflarePreviewDeploymentId: v.optional(v.string()),
    cloudflarePreviewUrl: v.optional(v.string()),
    cloudflarePreviewResourcesJson: v.optional(v.string()),
    cloudflarePreviewExpiresAt: v.optional(v.number()),
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
      v.literal("javascript"),
      v.literal("sql"),
      v.literal("json")
    ),
    fileType: v.union(
      v.literal("page"),
      v.literal("partial"),
      v.literal("style"),
      v.literal("script"),
      v.literal("worker"),
      v.literal("migration"),
      v.literal("config")
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

  projectMessages: defineTable({
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("streaming"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    runId: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_time", ["projectId", "createdAt"]),

  projectVersions: defineTable({
    projectId: v.id("projects"),
    messageId: v.optional(v.id("projectMessages")),
    summary: v.string(),
    filesJson: v.string(),
    createdAt: v.number(),
  }).index("by_project_time", ["projectId", "createdAt"]),

  generationRuns: defineTable({
    projectId: v.id("projects"),
    kind: v.union(v.literal("initial"), v.literal("build"), v.literal("discuss"), v.literal("repair")),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("cancelled")),
    prompt: v.string(),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_time", ["projectId", "createdAt"]),

  runEvents: defineTable({
    projectId: v.id("projects"),
    runId: v.id("generationRuns"),
    sequence: v.number(),
    type: v.string(),
    message: v.string(),
    path: v.optional(v.string()),
    detailsJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_sequence", ["runId", "sequence"]),

  userIntegrations: defineTable({
    userId: v.string(),
    githubAccessToken: v.optional(v.string()),
    vercelAccessToken: v.optional(v.string()),
    netlifyAccessToken: v.optional(v.string()),
    cloudflareApiToken: v.optional(v.string()),
    cloudflareRefreshToken: v.optional(v.string()),
    cloudflareTokenExpiresAt: v.optional(v.number()),
    cloudflareOAuthScope: v.optional(v.string()),
    cloudflareTokenId: v.optional(v.string()),
    cloudflareAccountId: v.optional(v.string()),
    cloudflareAccountName: v.optional(v.string()),
    githubConnectedAt: v.optional(v.number()),
    vercelConnectedAt: v.optional(v.number()),
    netlifyConnectedAt: v.optional(v.number()),
    cloudflareConnectedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  deploymentHistory: defineTable({
    projectId: v.id("projects"),
    provider: v.string(),
    deploymentUrl: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    netlifySiteName: v.optional(v.string()),
    cloudflareProjectName: v.optional(v.string()),
    cloudflareDeploymentId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_time", ["projectId", "createdAt"]),

  aiSettings: defineTable({
    userId: v.string(),
    adminConfigJson: v.string(),
    byokConfigJson: v.string(),
    customModelsJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Global admin model configuration (singleton — one document for the whole app)
  adminModelConfig: defineTable({
    configJson: v.string(), // JSON-encoded AIAdminConfig
    updatedBy: v.optional(v.string()), // userId of last admin who saved
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  aiAdminAudit: defineTable({
    userId: v.string(),
    email: v.string(),
    action: v.string(),
    detailsJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_time", ["userId", "createdAt"])
    .index("by_time", ["createdAt"]),
});
