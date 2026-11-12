import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { bootstrapPlatformAdmin, isAllowlistedPlatformEmail } from './auth';
import { tenantsClient } from './tenantsClient';
import { findUsersByEmail, normalizeEmail, resolveCanonicalUserByEmail } from './users';

type DbCtx = QueryCtx | MutationCtx;

export type OnboardingStatus = 'pending' | 'invited' | 'active';

export function isOAuthAllowedStatus(status: OnboardingStatus | undefined): boolean {
  return status === 'active' || status === 'invited';
}

export function toUserId(userId: string): Id<'users'> {
  return userId as Id<'users'>;
}

export async function markUserPending(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.patch(userId, {
    onboardingStatus: 'pending',
    invitedAt: undefined,
    activatedAt: undefined,
  });
}

export async function markUserInvited(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.patch(userId, {
    onboardingStatus: 'invited',
    invitedAt: Date.now(),
  });
}

export async function markUserActive(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.patch(userId, {
    onboardingStatus: 'active',
    activatedAt: Date.now(),
  });
}

export async function resetUserOnboarding(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.patch(userId, {
    onboardingStatus: undefined,
    invitedAt: undefined,
    activatedAt: undefined,
  });
}

export function asInvitationList(
  result: Awaited<ReturnType<typeof tenantsClient.listInvitations>>
) {
  return Array.isArray(result) ? result : result.page;
}

export async function getFirstActiveInvitation(ctx: DbCtx, email: string) {
  const pendingInvitations = await tenantsClient.getPendingInvitations(ctx, normalizeEmail(email));
  return pendingInvitations.find((entry) => !entry.isExpired) ?? null;
}

export async function getPendingInvitationForOrg(
  ctx: DbCtx,
  organizationId: string,
  email: string
) {
  const normalized = normalizeEmail(email);
  const invitations = asInvitationList(
    await tenantsClient.listInvitations(ctx, organizationId, { status: 'pending' })
  );
  return (
    invitations.find(
      (invitation) => invitation.inviteeIdentifier === normalized && !invitation.isExpired
    ) ?? null
  );
}

export async function cancelPendingInvitationsForOrgEmail(
  ctx: MutationCtx,
  actorUserId: Id<'users'>,
  organizationId: string,
  email: string
) {
  const normalized = normalizeEmail(email);
  const invitations = asInvitationList(
    await tenantsClient.listInvitations(ctx, organizationId, { status: 'pending' })
  );
  for (const invitation of invitations) {
    if (invitation.inviteeIdentifier !== normalized) {
      continue;
    }
    try {
      await tenantsClient.cancelInvitation(ctx, actorUserId, invitation._id);
    } catch {
      // Invitation may have been accepted, cancelled, or declined concurrently.
    }
  }
}

export async function cancelPendingInvitationsForEmail(
  ctx: MutationCtx,
  actorUserId: Id<'users'>,
  email: string
) {
  const normalized = normalizeEmail(email);
  const organizations = await tenantsClient.listOrganizations(ctx, actorUserId);
  for (const organization of organizations) {
    await cancelPendingInvitationsForOrgEmail(ctx, actorUserId, organization._id, normalized);
  }

  // Fallback for invitations in orgs the actor no longer belongs to (stale e2e data).
  const visible = await tenantsClient.getPendingInvitations(ctx, normalized);
  for (const invitation of visible) {
    try {
      await tenantsClient.cancelInvitation(ctx, actorUserId, invitation._id);
    } catch {
      // ignore
    }
  }
}

export type SingleOrgCheckResult = { ok: true } | { ok: false; reason: 'already_in_another_org' };

export async function checkSingleOrg(
  ctx: MutationCtx,
  email: string,
  organizationId: string
): Promise<SingleOrgCheckResult> {
  const normalized = normalizeEmail(email);
  const users = await findUsersByEmail(ctx, normalized);
  const user = users[0];

  if (user) {
    const organizations = await tenantsClient.listOrganizations(ctx, user._id);
    for (const organization of organizations) {
      if (organization._id === organizationId) {
        continue;
      }
      const member = await tenantsClient.getMember(ctx, organization._id, user._id);
      if (member && (member.status ?? 'active') === 'active') {
        return { ok: false, reason: 'already_in_another_org' };
      }
    }
  }

  const pendingInvitations = await tenantsClient.getPendingInvitations(ctx, normalized);
  for (const invitation of pendingInvitations) {
    if (invitation.organizationId !== organizationId && !invitation.isExpired) {
      return { ok: false, reason: 'already_in_another_org' };
    }
  }

  return { ok: true };
}

export async function assertSingleOrgOrThrow(
  ctx: MutationCtx,
  email: string,
  organizationId: string
) {
  const result = await checkSingleOrg(ctx, email, organizationId);
  if (!result.ok) {
    throw new ConvexError('Este usuário já pertence a outra organização');
  }
}

export async function assertOAuthAllowed(ctx: MutationCtx, email: string) {
  const normalized = normalizeEmail(email);
  if (isAllowlistedPlatformEmail(normalized)) {
    return { allowed: true as const };
  }

  const user = await resolveCanonicalUserByEmail(ctx, normalized);
  if (!user) {
    return { allowed: false as const, reason: 'no_account' as const };
  }

  if (isOAuthAllowedStatus(user.onboardingStatus)) {
    return { allowed: true as const };
  }

  if (user.onboardingStatus === 'pending') {
    return { allowed: false as const, reason: 'pending_invite' as const };
  }

  return { allowed: false as const, reason: 'no_account' as const };
}

export async function completeOnboarding(ctx: MutationCtx, userId: Id<'users'>, email: string) {
  await bootstrapPlatformAdmin(ctx, userId);

  const normalized = normalizeEmail(email);
  const user = await ctx.db.get(userId);
  if (!user) {
    return { activated: false as const };
  }

  if (user.onboardingStatus === 'pending') {
    throw new ConvexError('O convite ainda não foi enviado');
  }

  if (user.onboardingStatus === 'active') {
    const organizations = await tenantsClient.listOrganizations(ctx, userId);
    return organizations[0]
      ? { activated: true as const, organizationId: organizations[0]._id }
      : { activated: false as const };
  }

  const invitation = await getFirstActiveInvitation(ctx, normalized);
  if (invitation) {
    const singleOrg = await checkSingleOrg(ctx, normalized, invitation.organizationId);
    if (!singleOrg.ok) {
      throw new ConvexError('Este usuário já pertence a outra organização');
    }

    await tenantsClient.acceptInvitation(ctx, invitation._id, userId, {
      acceptingUserIdentifier: normalized,
    });
    await markUserActive(ctx, userId);
    return { activated: true as const, organizationId: invitation.organizationId };
  }

  const organizations = await tenantsClient.listOrganizations(ctx, userId);
  if (organizations.length > 0) {
    await markUserActive(ctx, userId);
    return { activated: true as const, organizationId: organizations[0]._id };
  }

  return { activated: false as const };
}

export async function seedActiveUser(ctx: MutationCtx, userId: Id<'users'>) {
  await ctx.db.patch(userId, {
    onboardingStatus: 'active',
    activatedAt: Date.now(),
  });
}
