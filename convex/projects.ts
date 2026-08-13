import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canAccessProject,
  canReadProject,
  getUserId,
  requireProjectAccess,
  requireUserId,
} from "./auth";

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

/** Requires sign-in; returns null unless the caller owns the project (or it is an orphan). */
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
    if (!(await canReadProject(ctx, project, userId))) return null;
    if (!project || !userId) return null;
    const member = project.userId === userId ? null : await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', userId)).first();
    return { ...project, accessRole: project.userId === userId ? 'owner' as const : member?.role ?? 'viewer' as const };
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
      if (!canAccessProject(existing, userId)) {
        throw new Error("Unauthorized to edit this project");
      }
      await ctx.db.patch(existing._id, {
        prompt: args.prompt,
        // `?? existing.html` matters: callers that patch unrelated fields omit `html`, and an
        // unconditional assignment blanked the page content for them.
        html: args.html ?? existing.html,
        status: args.status,
        userId: existing.userId ?? userId,
        isPublished: args.isPublished,
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

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
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Atomically claim an orphan project (userId unset). Legacy rows only — see canAccessProject. */
export const claimProjectOrphan = mutation({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectName", (q) => q.eq("projectName", args.projectName))
      .first();
    if (!project) throw new Error("Project not found");
    if (project.userId && project.userId !== userId) {
      throw new Error("Unauthorized to edit this project");
    }
    if (!project.userId) {
      await ctx.db.patch(project._id, { userId, updatedAt: Date.now() });
    }
    return project._id;
  },
});

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
    const project = await requireProjectAccess(ctx, args.projectName);
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

/** Clone a public project without exposing its owner or internal deployment credentials. */
export const remixPublishedProject = mutation({
  args: { sourceProjectName: v.string(), projectName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const projectName = args.projectName.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(projectName)) throw new Error("Use 1–63 lowercase letters, numbers, or hyphens");
    const [source, target] = await Promise.all([
      ctx.db.query("projects").withIndex("by_projectName", (q) => q.eq("projectName", args.sourceProjectName)).first(),
      ctx.db.query("projects").withIndex("by_projectName", (q) => q.eq("projectName", projectName)).first(),
    ]);
    if (!source?.isPublished) throw new Error("Published project not found");
    if (target) throw new Error("That project name is already taken");
    const files = await ctx.db.query("projectFiles").withIndex("by_project", (q) => q.eq("projectId", source._id)).take(201);
    if (files.length > 200) throw new Error("This project is too large to remix");
    const totalBytes = files.reduce((sum, file) => sum + file.content.length, 0);
    if (totalBytes > 2_000_000) throw new Error("This project is too large to remix");
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      projectName,
      prompt: `Remix of ${source.projectName}`,
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

export const publishProject = mutation({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await requireProjectAccess(ctx, args.projectName);

    await ctx.db.patch(project._id, {
      isPublished: true,
      userId: project.userId ?? userId,
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
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (!canAccessProject(project, userId)) throw new Error("Unauthorized");

    await ctx.db.patch(args.projectId, {
      favicon: args.favicon !== undefined ? args.favicon : project.favicon,
      globalSeo: args.globalSeo !== undefined ? args.globalSeo : project.globalSeo,
      seoData: args.seoData !== undefined ? args.seoData : project.seoData,
      updatedAt: Date.now(),
    });
  },
});

export const getUserProjects = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const owned = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    const memberships = await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    const shared = (await Promise.all(memberships.map(async (membership) => {
      const project = await ctx.db.get(membership.projectId);
      return project ? { ...project, accessRole: membership.role } : null;
    }))).filter((project): project is NonNullable<typeof project> => project !== null);
    return [...owned.map((project) => ({ ...project, accessRole: 'owner' as const })), ...shared].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

const DELETE_BATCH_SIZE = 50;

export const deleteProjectData = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);
    const history = await ctx.db
      .query("editHistory")
      .withIndex("by_project_time", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);
    const deployments = await ctx.db
      .query("deploymentHistory")
      .withIndex("by_project_time", (q) => q.eq("projectId", args.projectId))
      .take(DELETE_BATCH_SIZE);
    const messages = await ctx.db.query("projectMessages").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).take(DELETE_BATCH_SIZE);
    const versions = await ctx.db.query("projectVersions").withIndex("by_project_time", (q) => q.eq("projectId", args.projectId)).take(DELETE_BATCH_SIZE);
    const runs = await ctx.db.query("generationRuns").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).take(DELETE_BATCH_SIZE);
    const runEventBatches = await Promise.all(runs.map((run) => ctx.db.query("runEvents").withIndex("by_run", (q) => q.eq("runId", run._id)).take(DELETE_BATCH_SIZE + 1)));
    const runEvents = runEventBatches.flatMap((events) => events.slice(0, DELETE_BATCH_SIZE));
    const completedRuns = runs.filter((_, index) => runEventBatches[index].length <= DELETE_BATCH_SIZE);
    const members = await ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).take(DELETE_BATCH_SIZE);
    const invites = await ctx.db.query('projectInvites').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).take(DELETE_BATCH_SIZE);

    for (const row of [...files, ...history, ...deployments, ...messages, ...versions, ...runEvents, ...completedRuns, ...members, ...invites]) {
      await ctx.db.delete(row._id);
    }

    if (
      files.length === DELETE_BATCH_SIZE ||
      history.length === DELETE_BATCH_SIZE ||
      deployments.length === DELETE_BATCH_SIZE ||
      messages.length === DELETE_BATCH_SIZE ||
      versions.length === DELETE_BATCH_SIZE ||
      runs.length === DELETE_BATCH_SIZE ||
      runEvents.length >= DELETE_BATCH_SIZE ||
      members.length === DELETE_BATCH_SIZE ||
      invites.length === DELETE_BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, args);
    }
  },
});

export const deleteProject = mutation({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const project = await requireProjectAccess(ctx, args.projectName);
    const userId = await requireUserId(ctx);
    if (project.userId !== userId) throw new Error('Only the project owner can delete it');

    // Remove the parent first so no new child rows can be written while cleanup runs in batches.
    await ctx.db.delete(project._id);
    await ctx.scheduler.runAfter(0, internal.projects.deleteProjectData, {
      projectId: project._id,
    });
  },
});
