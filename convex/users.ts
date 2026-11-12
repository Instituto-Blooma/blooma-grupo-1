import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { resolveActingUserId } from './lib/auth';
import { normalizeEmail } from './lib/users';

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});

export const getIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalized = normalizeEmail(email);
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalized))
      .first();
    return user?._id ?? null;
  },
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').collect();
    return users
      .filter((u) => u.email)
      .map((u) => ({ email: u.email as string, name: u.name ?? (u.email as string) }));
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Você precisa entrar na sua conta');
    }
    await ctx.db.patch(userId, args);
    return await ctx.db.get(userId);
  },
});
