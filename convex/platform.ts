import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { authz } from './authz';
import {
  getActiveImpersonationSession,
  getUserEmail,
  isPlatformAdmin,
  requireAuthUserId,
  requirePlatformAdmin,
} from './lib/auth';
import {
  createOrganizationSchema,
  impersonationSchema,
  parseOrThrow,
  slugifyOrganizationName,
} from './lib/forms';
import { tenantsClient } from './lib/tenantsClient';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000;

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const adminId = await requireAuthUserId(ctx);
    await requirePlatformAdmin(ctx, adminId);
    await authz.require(ctx, adminId, 'platform:manageAllOrgs');

    const parsed = parseOrThrow(createOrganizationSchema, {
      name: args.name,
      slug: args.slug ?? '',
    });
    const slug = parsed.slug || slugifyOrganizationName(parsed.name);

    return await tenantsClient.createOrganization(ctx, adminId, parsed.name, { slug });
  },
});

export const getActiveImpersonation = query({
  args: {},
  handler: async (ctx) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) {
      return null;
    }
    if (!(await isPlatformAdmin(ctx, adminId))) {
      return null;
    }
    const session = await getActiveImpersonationSession(ctx, adminId);
    if (!session) {
      return null;
    }
    const target = await ctx.db.get(session.targetUserId);
    return {
      sessionId: session._id,
      targetUserId: session.targetUserId,
      targetEmail: target?.email ?? null,
      targetName: target?.name ?? null,
      expiresAt: session.expiresAt,
    };
  },
});

export const startImpersonation = mutation({
  args: { targetUserId: v.id('users') },
  returns: v.object({
    sessionId: v.id('impersonationSessions'),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    parseOrThrow(impersonationSchema, { targetUserId: args.targetUserId });

    const adminId = await requireAuthUserId(ctx);
    if (adminId === args.targetUserId) {
      throw new ConvexError('Não é possível acessar como você mesmo');
    }
    await requirePlatformAdmin(ctx, adminId);
    await authz.require(ctx, adminId, 'platform:impersonate');

    const now = Date.now();
    const active = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_admin', (q) => q.eq('adminUserId', adminId))
      .collect();
    for (const session of active) {
      if (!session.endedAt) {
        await ctx.db.patch(session._id, { endedAt: now });
      }
    }

    const sessionId = await ctx.db.insert('impersonationSessions', {
      adminUserId: adminId,
      targetUserId: args.targetUserId,
      startedAt: now,
      expiresAt: now + IMPERSONATION_TTL_MS,
    });

    return { sessionId, expiresAt: now + IMPERSONATION_TTL_MS };
  },
});

export const stopImpersonation = mutation({
  args: {},
  handler: async (ctx) => {
    const adminId = await requireAuthUserId(ctx);
    await requirePlatformAdmin(ctx, adminId);
    const now = Date.now();
    const sessions = await ctx.db
      .query('impersonationSessions')
      .withIndex('by_admin', (q) => q.eq('adminUserId', adminId))
      .collect();
    let stopped = 0;
    for (const session of sessions) {
      if (!session.endedAt) {
        await ctx.db.patch(session._id, { endedAt: now });
        stopped += 1;
      }
    }
    return { stopped };
  },
});

export const isCurrentUserPlatformAdmin = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return false;
    }
    return await isPlatformAdmin(ctx, userId);
  },
});

export const getPlatformAdminEmail = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await getUserEmail(ctx, userId);
  },
});

export const requirePlatformAdminMutation = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    await requirePlatformAdmin(ctx, userId);
    return true;
  },
});

export const assertNotImpersonatingSelf = mutation({
  args: { targetUserId: v.id('users') },
  handler: async (ctx, args) => {
    const adminId = await requireAuthUserId(ctx);
    if (adminId === args.targetUserId) {
      throw new ConvexError('Não é possível acessar como você mesmo');
    }
    return true;
  },
});
