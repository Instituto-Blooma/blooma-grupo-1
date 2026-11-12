import { ConvexError, v } from 'convex/values';
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { api } from './_generated/api';
import {
  isPlatformAdmin,
  requirePlatformAdmin,
  requireUserId,
  resolveActingUserId,
} from './lib/auth';
import { GUEST_ONBOARDING_STATUS } from './lib/guestQuery';
import { sendInvitationEmail } from './lib/invitations';
import {
  assertOAuthAllowed as checkOAuthAllowed,
  assertSingleOrgOrThrow,
  asInvitationList,
  cancelPendingInvitationsForEmail,
  completeOnboarding,
  getFirstActiveInvitation,
  getPendingInvitationForOrg,
  markUserInvited,
  markUserPending,
  resetUserOnboarding,
  toUserId,
} from './lib/onboarding';
import { reassignAllOrgResources } from './lib/succession';
import { tenantsClient } from './lib/tenantsClient';
import { ensureUserByEmail, findUsersByEmail, normalizeEmail } from './lib/users';
import { parseOrThrow, provisionUserSchema } from './lib/forms';

const roleValidator = v.union(v.literal('admin'), v.literal('member'));

async function requireProvisionPermission(
  ctx: QueryCtx | MutationCtx,
  actorId: Awaited<ReturnType<typeof requireUserId>>,
  organizationId: string,
  permission: 'members:add' | 'invitations:create' | 'members:remove' | 'members:list'
) {
  if (await isPlatformAdmin(ctx, actorId)) {
    return;
  }
  await ctx.runQuery(api.tenants.checkPermission, {
    organizationId,
    permission,
  });
}

async function ensureDraftInvitation(
  ctx: MutationCtx,
  actorId: Awaited<ReturnType<typeof requireUserId>>,
  organizationId: string,
  email: string,
  role: 'admin' | 'member'
): Promise<{ invitationId: string }> {
  const existing = await getPendingInvitationForOrg(ctx, organizationId, email);
  if (existing) {
    return { invitationId: existing._id };
  }

  const created = await tenantsClient.inviteMember(ctx, actorId, organizationId, email, role, {
    identifierType: 'email',
  });
  return { invitationId: created.invitationId };
}

async function deliverInvitationEmail(
  ctx: MutationCtx,
  organizationId: string,
  email: string,
  invitationId: string
) {
  const organization = await tenantsClient.getOrganization(ctx, organizationId);
  if (!organization) {
    throw new ConvexError('Organização não encontrada');
  }

  await sendInvitationEmail(ctx, {
    inviteeIdentifier: normalizeEmail(email),
    organizationName: organization.name,
    invitationId,
  });
}

export const listOnboardingForOrg = query({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProvisionPermission(ctx, userId, args.organizationId, 'members:list');

    const rows: Array<{
      id: string;
      email: string;
      role: string;
      status: 'pending' | 'invited' | 'active';
      organizationId: string;
    }> = [];

    const invitationList = asInvitationList(
      await tenantsClient.listInvitations(ctx, args.organizationId, { status: 'pending' })
    );

    for (const invitation of invitationList) {
      if (invitation.isExpired) {
        continue;
      }
      const matches = await findUsersByEmail(ctx, invitation.inviteeIdentifier);
      const user = matches[0];
      const status = user?.onboardingStatus === 'invited' ? 'invited' : 'pending';
      rows.push({
        id: invitation._id,
        email: invitation.inviteeIdentifier,
        role: invitation.role,
        status,
        organizationId: args.organizationId,
      });
    }

    const members = await ctx.runQuery(api.tenants.listMembers, {
      organizationId: args.organizationId,
      status: 'all',
    });
    const memberList = Array.isArray(members) ? members : members.page;

    for (const member of memberList) {
      const userRecord = await ctx.db.get(toUserId(member.userId));
      const email = userRecord?.email ? normalizeEmail(userRecord.email) : null;
      if (!email) {
        continue;
      }
      if (rows.some((row) => row.email === email)) {
        continue;
      }
      rows.push({
        id: member.userId,
        email,
        role: member.role,
        status: 'active',
        organizationId: args.organizationId,
      });
    }

    return rows;
  },
});

export const provisionUser = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
    role: roleValidator,
    sendInvite: v.boolean(),
  },
  returns: v.object({
    userId: v.id('users'),
    email: v.string(),
    status: v.union(v.literal('invited'), v.literal('pending')),
  }),
  handler: async (ctx, args) => {
    parseOrThrow(provisionUserSchema, args);

    const actorId = await requireUserId(ctx);
    const email = normalizeEmail(args.email);

    await requireProvisionPermission(ctx, actorId, args.organizationId, 'members:add');
    await assertSingleOrgOrThrow(ctx, email, args.organizationId);

    const { user } = await ensureUserByEmail(ctx, email);
    if (user.onboardingStatus === 'active') {
      throw new ConvexError('Este usuário já está ativo');
    }

    await markUserPending(ctx, user._id);
    const invitation = await ensureDraftInvitation(
      ctx,
      actorId,
      args.organizationId,
      email,
      args.role
    );

    if (args.sendInvite) {
      await deliverInvitationEmail(ctx, args.organizationId, email, invitation.invitationId);
      await markUserInvited(ctx, user._id);
    }

    return {
      userId: user._id,
      email,
      status: args.sendInvite ? ('invited' as const) : ('pending' as const),
    };
  },
});

export const sendInvite = mutation({
  args: {
    organizationId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUserId(ctx);
    const email = normalizeEmail(args.email);

    await requireProvisionPermission(ctx, actorId, args.organizationId, 'invitations:create');

    const matches = await findUsersByEmail(ctx, email);
    const user = matches[0];
    if (!user) {
      throw new ConvexError('Usuário não encontrado nesta organização');
    }
    if (user.onboardingStatus === 'active') {
      throw new ConvexError('Este usuário já está ativo');
    }
    if (user.onboardingStatus === 'invited') {
      throw new ConvexError('O convite já foi enviado');
    }

    const invitation = await getPendingInvitationForOrg(ctx, args.organizationId, email);
    if (!invitation) {
      throw new ConvexError('Usuário cadastrado não encontrado nesta organização');
    }

    await deliverInvitationEmail(ctx, args.organizationId, email, invitation._id);
    await markUserInvited(ctx, user._id);
  },
});

export const removeMemberWithSuccession = mutation({
  args: {
    organizationId: v.string(),
    memberUserId: v.id('users'),
    successorUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUserId(ctx);
    await requireProvisionPermission(ctx, actorId, args.organizationId, 'members:remove');

    const successor = await ctx.runQuery(api.tenants.getMember, {
      organizationId: args.organizationId,
      userId: args.successorUserId,
    });
    if (!successor) {
      throw new ConvexError('O sucessor precisa ser membro desta organização');
    }
    if (args.successorUserId === args.memberUserId) {
      throw new ConvexError('O sucessor precisa ser outro membro');
    }

    await reassignAllOrgResources(
      ctx,
      args.organizationId,
      args.memberUserId,
      args.successorUserId
    );
    await ctx.runMutation(api.tenants.removeMember, {
      organizationId: args.organizationId,
      memberUserId: args.memberUserId,
    });

    const user = await ctx.db.get(args.memberUserId);
    if (user?.email) {
      await cancelPendingInvitationsForEmail(ctx, actorId, user.email);
      await resetUserOnboarding(ctx, args.memberUserId);
    }
  },
});

export const moveUserToOrg = mutation({
  args: {
    fromOrganizationId: v.string(),
    toOrganizationId: v.string(),
    userId: v.id('users'),
    successorUserId: v.id('users'),
    role: roleValidator,
    sendInvite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUserId(ctx);
    await requirePlatformAdmin(ctx, actorId);

    await reassignAllOrgResources(ctx, args.fromOrganizationId, args.userId, args.successorUserId);
    await ctx.runMutation(api.tenants.removeMember, {
      organizationId: args.fromOrganizationId,
      memberUserId: args.userId,
    });

    const user = await ctx.db.get(args.userId);
    if (!user?.email) {
      throw new ConvexError('Informe o e-mail do usuário');
    }
    const email = normalizeEmail(user.email);

    await cancelPendingInvitationsForEmail(ctx, actorId, email);
    await resetUserOnboarding(ctx, args.userId);
    await assertSingleOrgOrThrow(ctx, email, args.toOrganizationId);
    await markUserPending(ctx, args.userId);

    const invitation = await ensureDraftInvitation(
      ctx,
      actorId,
      args.toOrganizationId,
      email,
      args.role
    );

    const sendInviteNow = args.sendInvite ?? true;
    if (sendInviteNow) {
      await deliverInvitationEmail(ctx, args.toOrganizationId, email, invitation.invitationId);
      await markUserInvited(ctx, args.userId);
    }
  },
});

export const getMyOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return GUEST_ONBOARDING_STATUS;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { status: 'unknown' as const };
    }
    const email = user.email ? normalizeEmail(user.email) : null;
    if (!email) {
      return { status: 'unknown' as const };
    }
    if (await isPlatformAdmin(ctx, userId)) {
      return { status: 'platform_admin' as const };
    }

    if (user.onboardingStatus === 'active') {
      const organizations = await tenantsClient.listOrganizations(ctx, userId);
      const organization = organizations[0];
      if (!organization) {
        return { status: 'unprovisioned' as const };
      }
      const member = await tenantsClient.getMember(ctx, organization._id, userId);
      return {
        status: 'active' as const,
        organizationId: organization._id,
        role: member?.role ?? 'member',
      };
    }

    if (user.onboardingStatus === 'invited' || user.onboardingStatus === 'pending') {
      const invitation = await getFirstActiveInvitation(ctx, email);
      if (invitation) {
        return {
          status: user.onboardingStatus,
          organizationId: invitation.organizationId,
          role: invitation.role,
        };
      }
    }

    return { status: 'unprovisioned' as const };
  },
});

export const assertOAuthAllowed = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await checkOAuthAllowed(ctx, args.email);
  },
});

export const activateOnboarding = internalMutation({
  args: { userId: v.id('users'), email: v.string() },
  handler: async (ctx, args) => {
    return await completeOnboarding(ctx, args.userId, args.email);
  },
});
