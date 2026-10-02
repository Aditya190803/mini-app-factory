import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getProjectRole,
  getUserId,
  requireProjectAccess,
  requireProjectRole,
  requireProjectRoleById,
  requireUserId,
  roleAtLeast,
} from "./auth";

/**
 * Fields that never leave the server. `cloudflareEnvVarsEncrypted` is ciphertext, but handing it
 * to every member let a viewer paste it into their own project and have it decrypted there.
 * The Next.js server reads it through `getProjectCloudflareEnvVars`, which is owner-only.
 */
/** Mirrors PROJECT_NAME_PATTERN in lib/deploy-shared.ts (Convex cannot import from lib/). */
const PROJECT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,57}$/;

function toClientProject(project: Doc<"projects">) {
  const { cloudflareEnvVarsEncrypted, ...rest } = project;
  return { ...rest, hasCloudflareEnvVars: Boolean(cloudflareEnvVarsEncrypted) };
}

/**
 * Project records.
 *
 * Ownership comes from the verified identity on every handler — no function here takes a `userId`
 * argument any more. Previously they did, and compared it against the stored owner, which meant
 * passing the victim's id was enough to edit or delete their project.
 *
 * Exactly one function is callable without signing in: `getPublishedProject`, which serves the
 * public `/results/*` pages and returns nothing unless the project is published.
 */

/**
 * PUBLIC — no authentication. Returns a project only when it is published.
 *
 * Used by the anonymous `/results/<name>` route. Keep the `isPublished` filter inside the handler
 * rather than at the call site: this is the one query an unauthenticated caller can reach, so the
 * guarantee has to live here.
 */
export const getPublishedProject = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    if (!project || !project.isPublished) return null;
    return {
      projectName: project.projectName,
      isPublished: true as const,
      html: project.html,
      favicon: project.favicon,
      globalSeo: project.globalSeo,
      seoData: project.seoData,
    };
  },
});

/** Requires sign-in; returns null unless the caller is a member of the project. */
export const getProject = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    // Null rather than throw: client `useQuery` call sites treat this as "not found", and
    // throwing would surface a console error on every render for a project the user can't see.
    const accessRole = await getProjectRole(ctx, project, userId);
    if (!project || !accessRole) return null;
    return { ...toClientProject(project), accessRole };
  },
});

/** Owner-only: the encrypted Cloudflare env var blob, for the Next.js server to decrypt. */
export const getProjectCloudflareEnvVars = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectRole(ctx, args.projectName, "owner");
    return project.cloudflareEnvVarsEncrypted ?? null;
  },
});

/**
 * Does a project name already exist? Authenticated, and deliberately returns only a boolean —
 * name availability must be checkable without disclosing anything about someone else's project.
 */
export const projectNameTaken = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    return project !== null;
  },
});

export const saveProject = mutation({
  args: {
    projectName: v.string(),
    prompt: v.string(),
    html: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error")
    ),
    isPublished: v.boolean(),
    isMultiPage: v.optional(v.boolean()),
    pageCount: v.optional(v.number()),
    description: v.optional(v.string()),
    referenceUrl: v.optional(v.string()),
    selectedModel: v.optional(v.string()),
    providerId: v.optional(v.string()),
    deploymentUrl: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    deployProvider: v.optional(v.string()),
    deployedAt: v.optional(v.number()),
    netlifySiteName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();

    const now = Date.now();
    if (existing) {
      if (!roleAtLeast(await getProjectRole(ctx, existing, userId), "editor")) {
        throw new Error("Unauthorized to edit this project");
      }
      await ctx.db.patch(existing._id, {
        prompt: args.prompt,
        // `?? existing.html` matters: callers that patch unrelated fields omit `html`, and an
        // unconditional assignment blanked the page content for them.
        html: args.html ?? existing.html,
        status: args.status,
        // Publishing is owner-only (see publishProject); an editor's save keeps the current state.
        isPublished: existing.userId === userId ? args.isPublished : existing.isPublished,
        isMultiPage: args.isMultiPage ?? existing.isMultiPage ?? false,
        pageCount: args.pageCount ?? existing.pageCount ?? 0,
        description: args.description ?? existing.description,
        referenceUrl: args.referenceUrl ?? existing.referenceUrl,
        selectedModel: args.selectedModel ?? existing.selectedModel,
        providerId: args.providerId ?? existing.providerId,
        deploymentUrl: args.deploymentUrl ?? existing.deploymentUrl,
        repoUrl: args.repoUrl ?? existing.repoUrl,
        deployProvider: args.deployProvider ?? existing.deployProvider,
        deployedAt: args.deployedAt ?? existing.deployedAt,
        netlifySiteName: args.netlifySiteName ?? existing.netlifySiteName,
        updatedAt: now,
      });
      return existing._id;
    }

    throw new Error("Project not found");
  },
});

/**
 * Reserve a project name and create its row in one mutation.
 *
 * Doing the existence check and the insert together closes the TOCTOU that `check-name` had when
 * it called `projectExists()` and then `saveProject()` as two round-trips — two concurrent
 * requests could both see "free" and both insert, since nothing enforces uniqueness on the index.
 * Returns null when the name is taken so the caller can respond 409.
 */
export const reserveProjectName = mutation({
  args: {
    projectName: v.string(),
    prompt: v.string(),
    description: v.optional(v.string()),
    referenceUrl: v.optional(v.string()),
    selectedModel: v.optional(v.string()),
    providerId: v.optional(v.string()),
    target: v.optional(v.union(v.literal("static"), v.literal("edge"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    // Same rule as lib/deploy-shared.ts, enforced here because this mutation is callable directly.
    if (!PROJECT_NAME_PATTERN.test(args.projectName)) throw new Error("Invalid project name");

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    if (existing) return null;

    const now = Date.now();
    return await ctx.db.insert("projects", {
      projectName: args.projectName,
      prompt: args.prompt,
      status: "pending",
      userId,
      isPublished: false,
      isMultiPage: false,
      pageCount: 0,
      description: args.description,
      referenceUrl: args.referenceUrl,
      selectedModel: args.selectedModel,
      providerId: args.providerId,
      target: args.target,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Assign an owner to a legacy project that has none. Internal: run it from the Convex dashboard.
 * Orphans used to be claimable by whoever edited them first, which let anyone take them over.
 */
export const assignOrphanOwner = internalMutation({
  args: { projectName: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    if (!project) throw new Error("Project not found");
    if (project.userId) throw new Error("Project already has an owner");
    await ctx.db.patch(project._id, { userId: args.userId, updatedAt: Date.now() });
  },
});

/**
 * Cloudflare deployment state. Owner-only: the resources live in the owner's Cloudflare account,
 * and the stored resource IDs decide what later deploys and teardowns touch. If a member could
 * write them, they could point the owner's next deploy at the owner's other databases.
 */
export const updateCloudflareConfig = mutation({
  args: {
    projectName: v.string(),
    cloudflareProjectName: v.optional(v.union(v.string(), v.null())),
    cloudflareDeploymentId: v.optional(v.union(v.string(), v.null())),
    cloudflareD1DatabaseId: v.optional(v.union(v.string(), v.null())),
    cloudflareD1DatabaseName: v.optional(v.union(v.string(), v.null())),
    cloudflareCustomDomain: v.optional(v.union(v.string(), v.null())),
    cloudflareEnvVarsEncrypted: v.optional(v.union(v.string(), v.null())),
    cloudflareResourcesJson: v.optional(v.union(v.string(), v.null())),
    deploymentUrl: v.optional(v.union(v.string(), v.null())),
    cloudflarePreviewProjectName: v.optional(v.union(v.string(), v.null())),
    cloudflarePreviewDeploymentId: v.optional(v.union(v.string(), v.null())),
    cloudflarePreviewUrl: v.optional(v.union(v.string(), v.null())),
    cloudflarePreviewResourcesJson: v.optional(v.union(v.string(), v.null())),
    cloudflarePreviewExpiresAt: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const project = await requireProjectRole(ctx, args.projectName, "owner");
    const patch: Record<string, string | number | undefined> = { updatedAt: Date.now() };
    for (const key of [
      "cloudflareProjectName",
      "cloudflareDeploymentId",
      "cloudflareD1DatabaseId",
      "cloudflareD1DatabaseName",
      "cloudflareCustomDomain",
      "cloudflareEnvVarsEncrypted",
      "cloudflareResourcesJson",
      "deploymentUrl",
      "cloudflarePreviewProjectName",
      "cloudflarePreviewDeploymentId",
      "cloudflarePreviewUrl",
      "cloudflarePreviewResourcesJson",
      "cloudflarePreviewExpiresAt",
    ] as const) {
      if (args[key] !== undefined) patch[key] = args[key] ?? undefined;
    }
    await ctx.db.patch(project._id, patch);
    return project._id;
  },
});

/**
 * Copy a project: a public one (remix) or one you can edit (duplicate). Files and content come
 * across; ownership, members, deployments and Cloudflare state do not.
 */
export const remixPublishedProject = mutation({
  args: { sourceProjectName: v.string(), projectName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const projectName = args.projectName.trim().toLowerCase();
    if (!PROJECT_NAME_PATTERN.test(projectName)) throw new Error("Use up to 58 lowercase letters, numbers, and single hyphens");
    const [source, target] = await Promise.all([
      ctx.db.query("projects").withIndex("by_projectName", (q) => q.eq("projectName", args.sourceProjectName)).first(),
      ctx.db.query("projects").withIndex("by_projectName", (q) => q.eq("projectName", projectName)).first(),
    ]);
    // Published projects can be remixed by anyone signed in; an unpublished one can be duplicated
    // by its owner and editors. Viewers cannot copy what they were only allowed to read.
    if (!source || (!source.isPublished && !roleAtLeast(await getProjectRole(ctx, source, userId), "editor"))) {
      throw new Error("Project not found");
    }
    if (target) throw new Error("That project name is already taken");
    const files = await ctx.db.query("projectFiles").withIndex("by_project", (q) => q.eq("projectId", source._id)).take(201);
    if (files.length > 200) throw new Error("This project is too large to remix");
    const totalBytes = files.reduce((sum, file) => sum + file.content.length, 0);
    if (totalBytes > 2_000_000) throw new Error("This project is too large to remix");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      projectName,
      prompt: source.isPublished && source.userId !== userId ? `Remix of ${source.projectName}` : source.prompt,
      target: source.target,
      html: source.html,
      status: "completed",
      userId,
      isPublished: false,
      isMultiPage: source.isMultiPage,
      pageCount: source.pageCount,
      description: source.description,
      globalCss: source.globalCss,
      globalJs: source.globalJs,
      globalHeader: source.globalHeader,
      globalFooter: source.globalFooter,
      favicon: source.favicon,
      globalSeo: source.globalSeo,
      seoData: source.seoData,
      createdAt: now,
      updatedAt: now,
    });
    for (const file of files) {
      await ctx.db.insert("projectFiles", { projectId, path: file.path, content: file.content, language: file.language, fileType: file.fileType, createdAt: now, updatedAt: now });
    }
    return { projectName, fileCount: files.length };
  },
});

export const updateProjectInstructions = mutation({
  args: { projectName: v.string(), instructions: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectAccess(ctx, args.projectName);
    const instructions = args.instructions.trim().slice(0, 20_000);
    await ctx.db.patch(project._id, { projectInstructions: instructions || undefined, updatedAt: Date.now() });
    return project._id;
  },
});

/** Owner-only: making a project public is the owner's call, not an editor's. */
export const publishProject = mutation({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectRole(ctx, args.projectName, "owner");

    await ctx.db.patch(project._id, {
      isPublished: true,
      updatedAt: Date.now(),
    });
  },
});

export const updateMetadata = mutation({
  args: {
    projectId: v.id("projects"),
    favicon: v.optional(v.string()),
    globalSeo: v.optional(v.object({
      siteName: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    })),
    seoData: v.optional(v.array(v.object({
      path: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      ogImage: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    // This had no userId argument and no ownership check at all, so anyone could rewrite the
    // title, description, og:image, and favicon of any published site.
    const project = await requireProjectRoleById(ctx, args.projectId, "editor");

    await ctx.db.patch(args.projectId, {
      favicon: args.favicon !== undefined ? args.favicon : project.favicon,
      globalSeo: args.globalSeo !== undefined ? args.globalSeo : project.globalSeo,
      seoData: args.seoData !== undefined ? args.seoData : project.seoData,
      updatedAt: Date.now(),
    });
  },
});

const PROJECT_LIST_LIMIT = 200;

/** List rows drop the legacy content blobs: the list page never renders them. */
function toListProject(project: Doc<"projects">) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { html, pages, globalCss, globalJs, globalHeader, globalFooter, ...rest } = toClientProject(project);
  return rest;
}

export const getUserProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Bounded reads: an unbounded collect() of full project documents grows without limit.
    const owned = await ctx.db
      .query("projects")
      .withIndex("by_userId_updated", (q) => q.eq("userId", userId))
      .order("desc")
      .take(PROJECT_LIST_LIMIT);
    const memberships = await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', userId)).take(PROJECT_LIST_LIMIT);
    const shared = (await Promise.all(memberships.map(async (membership) => {
      const project = await ctx.db.get(membership.projectId);
      return project ? { ...toListProject(project), accessRole: membership.role } : null;
    }))).filter((project): project is NonNullable<typeof project> => project !== null);
    return [...owned.map((project) => ({ ...toListProject(project), accessRole: 'owner' as const })), ...shared].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Child tables of a project, deleted one table per pass. Mixing all of them in one transaction
 * read up to 50 files (each up to ~0.8 MB) plus version chunks at once and could exceed the
 * transaction read limit, which left the child rows orphaned for good.
 */
const CHILD_TABLES = [
  { table: 'projectFiles', batch: 5 },
  { table: 'projectVersionChunks', batch: 5 },
  { table: 'projectVersions', batch: 50 },
  { table: 'projectMessages', batch: 50 },
  { table: 'runEvents', batch: 200 },
  { table: 'generationRuns', batch: 100 },
  { table: 'editHistory', batch: 20 },
  { table: 'deploymentHistory', batch: 100 },
  { table: 'projectMembers', batch: 100 },
  { table: 'projectInvites', batch: 100 },
] as const;

export const deleteProjectData = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    for (const { table, batch } of CHILD_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .take(batch);
      if (rows.length === 0) continue;
      for (const row of rows) await ctx.db.delete(row._id);
      await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, args);
      return;
    }
  },
});


export const deleteProject = mutation({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectRole(ctx, args.projectName, "owner");

    // Remove the parent first so no new child rows can be written while cleanup runs in batches.
    await ctx.db.delete(project._id);
    await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, {
      projectId: project._id,
    });
  },
});
