import { makeTenantsAPI, type Member, type Invitation, type Team } from '@djpanda/convex-tenants';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { query, type MutationCtx, type QueryCtx } from './_generated/server';
import { authz, tenantsPermissionMap } from './authz';
import { orgScope, resolveActingUserId } from './lib/auth';
import { GUEST_PERMISSION, guestPaginatedList } from './lib/guestQuery';
import { afterInvitationResent } from './lib/invitations';
import { checkSingleOrg, markUserInvited } from './lib/onboarding';
import {
  tenantsClient,
  SEVEN_DAYS_MS,
  TENANT_ROLE_HIERARCHY,
  TENANT_VALID_ROLES,
} from './lib/tenantsClient';
import { resolveCanonicalUserByEmail } from './lib/users';

export { SEVEN_DAYS_MS, TENANT_ROLE_HIERARCHY, TENANT_VALID_ROLES };

async function getTenantUser(ctx: QueryCtx | MutationCtx, userId: string) {
  const user = await ctx.db.get(userId as Id<'users'>);
  return user ? { name: user.name ?? undefined, email: user.email ?? undefined } : null;
}

async function requireTenantMembership(ctx: QueryCtx, userId: string, organizationId: string) {
  const member = await tenantsClient.getMember(ctx, organizationId, userId);
  if (!member) {
    throw new Error('Você não é membro desta organização');
  }
  return member;
}

export const {
  getOrganization,
  getOrganizationBySlug,
  createOrganization,
  updateOrganization,
  transferOwnership,
  deleteOrganization,
  countMembers,
  getMember,
  getCurrentMember,
  getCurrentUserEmail,
  checkMemberPermission,
  addMember,
  bulkAddMembers,
  removeMember,
  bulkRemoveMembers,
  updateMemberRole,
  suspendMember,
  unsuspendMember,
  leaveOrganization,
  listTeamsAsTree,
  countTeams,
  getTeam,
  listTeamMembers,
  isTeamMember,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  countInvitations,
  getInvitation,
  getPendingInvitations,
  inviteMember,
  bulkInviteMembers,
  acceptInvitation,
  resendInvitation,
  cancelInvitation,
  declineInvitation,
  checkAnyPermission,
  getUserPermissions,
  getUserRoles,
  hasRole,
  grantPermission,
  denyPermission,
  recomputeUser,
  getAuditLog,
  syncRoles,
  syncRole,
} = makeTenantsAPI(components.tenants, {
  authz,
  creatorRole: 'admin',
  permissionMap: tenantsPermissionMap,
  roleHierarchy: TENANT_ROLE_HIERARCHY,
  validRoles: [...TENANT_VALID_ROLES],
  defaultInvitationExpiration: SEVEN_DAYS_MS,
  maxOrganizations: 1,
  auth: async (ctx) => {
    return await resolveActingUserId(ctx as QueryCtx | MutationCtx);
  },
  getUser: async (ctx, userId) => {
    return await getTenantUser(ctx as QueryCtx | MutationCtx, userId);
  },
  validateInvitationAccept: async (ctx, data) => {
    const result = await checkSingleOrg(
      ctx as MutationCtx,
      data.acceptingUserIdentifier,
      data.invitation.organizationId
    );
    if (!result.ok) {
      return { allowed: false, reason: 'User already belongs to another organization' };
    }
    return { allowed: true };
  },
  onInvitationCreated: async (ctx, invitation) => {
    const user = await resolveCanonicalUserByEmail(
      ctx as MutationCtx,
      invitation.inviteeIdentifier
    );
    if (user) {
      await markUserInvited(ctx as MutationCtx, user._id);
    }
  },
  onInvitationResent: async (ctx, invitation) => {
    await afterInvitationResent(ctx as MutationCtx, {
      inviteeIdentifier: invitation.inviteeIdentifier,
      organizationName: invitation.organizationName,
      invitationId: invitation.invitationId,
    });
  },
});

/**
 * Live TenantsProvider subscriptions refetch when the auth token is cleared.
 * Return empty/denied values for guests instead of throwing "Not authenticated".
 */
export const listOrganizations = query({
  args: {
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('archived'))),
    sortBy: v.optional(v.union(v.literal('name'), v.literal('createdAt'), v.literal('slug'))),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return [];
    }
    const orgs = await tenantsClient.listOrganizations(ctx, userId, {
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
    });
    if (args.status !== undefined) {
      return orgs.filter((org) => (org as { status?: string }).status === args.status);
    }
    return orgs;
  },
});

export const listMembers = query({
  args: {
    organizationId: v.string(),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('all'))),
    sortBy: v.optional(
      v.union(v.literal('role'), v.literal('joinedAt'), v.literal('createdAt'), v.literal('userId'))
    ),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return guestPaginatedList<Member>(args.paginationOpts);
    }
    await requireTenantMembership(ctx, userId, args.organizationId);
    try {
      await tenantsClient.requireOperation(
        ctx,
        userId,
        'listMembers',
        orgScope(args.organizationId)
      );
    } catch {
      return guestPaginatedList<Member>(args.paginationOpts);
    }

    const result = await tenantsClient.listMembers(ctx, args.organizationId, {
      status: args.status,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
      paginationOpts: args.paginationOpts,
    });

    if (args.paginationOpts) {
      const pageResult = result as { page: Member[]; isDone: boolean; continueCursor: string };
      if (pageResult.page.length === 0) {
        return pageResult;
      }
      return {
        ...pageResult,
        page: await Promise.all(
          pageResult.page.map(async (member) => ({
            ...member,
            user: await getTenantUser(ctx, member.userId),
          }))
        ),
      };
    }

    const members = result as Member[];
    return await Promise.all(
      members.map(async (member) => ({
        ...member,
        user: await getTenantUser(ctx, member.userId),
      }))
    );
  },
});

export const listTeams = query({
  args: {
    organizationId: v.string(),
    parentTeamId: v.optional(v.union(v.null(), v.string())),
    sortBy: v.optional(v.union(v.literal('name'), v.literal('createdAt'), v.literal('slug'))),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return guestPaginatedList<Team>(args.paginationOpts);
    }
    await requireTenantMembership(ctx, userId, args.organizationId);
    try {
      await tenantsClient.requireOperation(ctx, userId, 'listTeams', orgScope(args.organizationId));
    } catch {
      return guestPaginatedList<Team>(args.paginationOpts);
    }
    return await tenantsClient.listTeams(ctx, args.organizationId, {
      parentTeamId: args.parentTeamId,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const listInvitations = query({
  args: {
    organizationId: v.string(),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('accepted'),
        v.literal('cancelled'),
        v.literal('expired')
      )
    ),
    sortBy: v.optional(
      v.union(v.literal('inviteeIdentifier'), v.literal('expiresAt'), v.literal('createdAt'))
    ),
    sortOrder: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return guestPaginatedList<Invitation>(args.paginationOpts);
    }
    await requireTenantMembership(ctx, userId, args.organizationId);
    const canList = await tenantsClient.can(ctx, userId, 'invitations:list', args.organizationId);
    if (!canList) {
      return guestPaginatedList<Invitation>(args.paginationOpts);
    }
    return await tenantsClient.listInvitations(ctx, args.organizationId, {
      status: args.status,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const checkPermission = query({
  args: { organizationId: v.string(), permission: v.string() },
  returns: v.object({ allowed: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return GUEST_PERMISSION;
    }
    await requireTenantMembership(ctx, userId, args.organizationId);
    const allowed = await tenantsClient.can(ctx, userId, args.permission, args.organizationId);
    return { allowed, reason: allowed ? 'Allowed' : 'Permission denied' };
  },
});
