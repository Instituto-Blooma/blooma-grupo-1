import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { authz } from '../authz';
import { assertOAuthAllowed } from './onboarding';
import { normalizeEmail, resolveCanonicalUserByEmail } from './users';

export function orgScope(orgId: string) {
  return { type: 'org' as const, id: orgId };
}

/** Built-in Google emulate account (`emulate` always seeds this email). */
export const GOOGLE_EMULATE_DEFAULT_EMAIL = 'testuser@gmail.com';

/** First-setup / local-dev platform admins. Keep in sync with `script/setup.mjs`. */
export const DEFAULT_PLATFORM_ADMIN_EMAILS = [
  'dev@example.com',
  'admin@example.com',
  'platform@example.com',
  GOOGLE_EMULATE_DEFAULT_EMAIL,
] as const;

function parseAllowlist(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? DEFAULT_PLATFORM_ADMIN_EMAILS.join(',');
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowlistedPlatformEmail(email: string): boolean {
  return parseAllowlist().has(normalizeEmail(email));
}

export async function requireAuthUserId(ctx: QueryCtx | MutationCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error('Você precisa entrar na sua conta');
  }
  return userId;
}

export async function resolveActingUserId(
  ctx: QueryCtx | MutationCtx
): Promise<Id<'users'> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) {
    return null;
  }

  const session = await getActiveImpersonationSession(ctx, authUserId);
  if (session) {
    return session.targetUserId;
  }

  return authUserId;
}

export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<'users'>> {
  const userId = await resolveActingUserId(ctx);
  if (!userId) {
    throw new Error('Você precisa entrar na sua conta');
  }
  return userId;
}

export async function getUserEmail(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  return user?.email?.toLowerCase() ?? null;
}

export async function getActiveImpersonationSession(
  ctx: QueryCtx | MutationCtx,
  adminUserId: Id<'users'>
) {
  const now = Date.now();
  const session = await ctx.db
    .query('impersonationSessions')
    .withIndex('by_admin', (q) => q.eq('adminUserId', adminUserId))
    .order('desc')
    .first();
  if (!session || session.endedAt || session.expiresAt < now) {
    return null;
  }
  return session;
}

export async function isPlatformAdmin(ctx: QueryCtx | MutationCtx, userId: string) {
  const email = await getUserEmail(ctx, userId as Id<'users'>);
  if (email && isAllowlistedPlatformEmail(email)) {
    return true;
  }
  return authz.can(ctx, userId, 'platform:manageAllOrgs');
}

export async function requirePlatformAdmin(ctx: QueryCtx | MutationCtx, userId: string) {
  if (!(await isPlatformAdmin(ctx, userId))) {
    throw new Error('Acesso restrito à administração da plataforma');
  }
}

export async function bootstrapPlatformAdmin(ctx: MutationCtx, userId: Id<'users'>) {
  const email = await getUserEmail(ctx, userId);
  if (!email || !isAllowlistedPlatformEmail(email)) {
    return;
  }
  const hasRole = await authz.hasRole(ctx, userId, 'platform_admin');
  if (!hasRole) {
    await authz.assignRole(ctx, userId, 'platform_admin');
  }
}

async function scheduleActivation(ctx: MutationCtx, userId: Id<'users'>, email: string) {
  const canonical = await resolveCanonicalUserByEmail(ctx, email);
  const targetUserId = canonical?._id ?? userId;
  await ctx.scheduler.runAfter(0, internal.onboarding.activateOnboarding, {
    userId: targetUserId,
    email,
  });
}

export async function createOrUpdateOAuthUser(
  ctx: MutationCtx,
  args: {
    existingUserId?: Id<'users'> | null;
    profile: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
): Promise<Id<'users'>> {
  const email = args.profile.email ? normalizeEmail(args.profile.email) : null;
  if (!email) {
    throw new ConvexError('Informe o e-mail');
  }

  const gate = await assertOAuthAllowed(ctx, email);
  if (!gate.allowed) {
    if (gate.reason === 'pending_invite') {
      throw new ConvexError('Seu convite ainda não foi enviado. Fale com a administração.');
    }
    throw new ConvexError('Nenhuma conta encontrada. Fale com a administração.');
  }

  const existingUser = args.existingUserId
    ? await ctx.db.get(args.existingUserId)
    : await resolveCanonicalUserByEmail(ctx, email);

  if (existingUser) {
    await ctx.db.patch(existingUser._id, {
      name: args.profile.name ?? existingUser.name,
      email,
      image: args.profile.image ?? existingUser.image,
      emailVerificationTime: existingUser.emailVerificationTime ?? Date.now(),
    });
    await scheduleActivation(ctx, existingUser._id, email);
    return existingUser._id;
  }

  const userId = await ctx.db.insert('users', {
    name: args.profile.name ?? undefined,
    email,
    image: args.profile.image ?? undefined,
    emailVerificationTime: Date.now(),
  });

  await scheduleActivation(ctx, userId, email);

  return userId;
}
