import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireUserId } from './auth';

async function requireOwner(ctx: MutationCtx, projectId: Id<'projects'>) {
  const userId = await requireUserId(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.userId !== userId) throw new Error('Only the project owner can manage access');
  return { project, userId };
}

export const listAccess = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) return null;
    const [members, invites] = await Promise.all([
      ctx.db.query('projectMembers').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
      ctx.db.query('projectInvites').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).collect(),
    ]);
    return { members, invites: invites.filter((invite) => !invite.revokedAt && invite.expiresAt > Date.now() && invite.useCount < invite.maxUses) };
  },
});

export const createInvite = mutation({
  args: { projectId: v.id('projects'), role: v.union(v.literal('editor'), v.literal('viewer')) },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx, args.projectId);
    return await ctx.db.insert('projectInvites', { projectId: args.projectId, role: args.role, createdBy: userId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, maxUses: 1, useCount: 0, createdAt: Date.now() });
  },
});

export const acceptInvite = mutation({
  args: { inviteId: v.id('projectInvites') },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.revokedAt || invite.expiresAt <= Date.now() || invite.useCount >= invite.maxUses) throw new Error('This invitation is invalid or has expired');
    const project = await ctx.db.get(invite.projectId);
    if (!project) throw new Error('Project not found');
    if (project.userId === userId) return { projectName: project.projectName };
    const existing = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', invite.projectId).eq('userId', userId)).first();
    if (existing) await ctx.db.patch(existing._id, { role: invite.role });
    else await ctx.db.insert('projectMembers', { projectId: invite.projectId, userId, role: invite.role, createdAt: Date.now() });
    await ctx.db.patch(invite._id, { useCount: invite.useCount + 1 });
    return { projectName: project.projectName };
  },
});

export const revokeInvite = mutation({
  args: { projectId: v.id('projects'), inviteId: v.id('projectInvites') },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.projectId);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.projectId !== args.projectId) throw new Error('Invitation not found');
    await ctx.db.patch(invite._id, { revokedAt: Date.now() });
  },
});

export const removeMember = mutation({
  args: { projectId: v.id('projects'), memberId: v.id('projectMembers') },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.projectId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.projectId !== args.projectId) throw new Error('Member not found');
    await ctx.db.delete(member._id);
  },
});

export const updateMemberRole = mutation({
  args: { projectId: v.id('projects'), memberId: v.id('projectMembers'), role: v.union(v.literal('editor'), v.literal('viewer')) },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.projectId);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.projectId !== args.projectId) throw new Error('Member not found');
    await ctx.db.patch(member._id, { role: args.role });
  },
});
