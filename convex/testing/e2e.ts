import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import { authz } from '../authz';
import {
  bootstrapPlatformAdmin,
  GOOGLE_EMULATE_DEFAULT_EMAIL,
  orgScope,
  resolveActingUserId,
} from '../lib/auth';
import { sendInvitationEmail } from '../lib/invitations';
import {
  cancelPendingInvitationsForEmail,
  cancelPendingInvitationsForOrgEmail,
  markUserInvited,
  markUserPending,
  seedActiveUser,
} from '../lib/onboarding';
import { canAccessOrgTodo, getOrgScopedTodo } from '../lib/orgAccess';
import { tenantsClient } from '../lib/tenantsClient';
import { ensureUserByEmail } from '../lib/users';
import { internalMutation, query, type MutationCtx } from '../_generated/server';

export const DEV_ADMIN_EMAIL = 'dev@example.com';
export const PLATFORM_ADMIN_EMAIL = 'platform@example.com';
export const ORG_A_ADMIN_EMAIL = 'org-admin@example.com';
export const ORG_A_MEMBER_EMAIL = 'member@example.com';
export const ORG_B_ADMIN_EMAIL = 'org-b-admin@example.com';
export const ORG_B_MEMBER_EMAIL = 'org-b-member@example.com';
export const PENDING_USER_EMAIL = 'pending@example.com';
export const INVITED_USER_EMAIL = 'invited@example.com';
export const E2E_IMMEDIATE_EMAIL = 'e2e-immediate@example.com';

const E2E_INVITE_EMAILS = [PENDING_USER_EMAIL, INVITED_USER_EMAIL, E2E_IMMEDIATE_EMAIL] as const;

const E2E_PREFIX = 'E2E ';
const ORG_A_NAME = 'E2E Acme Corp';
const ORG_A_SLUG = 'e2e-acme-corp';
const ORG_B_NAME = 'E2E Beta Corp';
const ORG_B_SLUG = 'e2e-beta-corp';
const ORG_A_TODO_ALPHA = `${E2E_PREFIX}Acme Todo Alpha`;
const ORG_A_TODO_BETA = `${E2E_PREFIX}Acme Todo Beta`;
const ORG_B_TODO_ALPHA = `${E2E_PREFIX}Beta Todo Alpha`;
const ORG_B_TODO_BETA = `${E2E_PREFIX}Beta Todo Beta`;

async function resetInviteeUser(
  ctx: MutationCtx,
  platformUserId: Id<'users'>,
  organizationId: string | null,
  email: string,
  displayName: string
) {
  if (organizationId) {
    await cancelPendingInvitationsForOrgEmail(ctx, platformUserId, organizationId, email);
  }
  await cancelPendingInvitationsForEmail(ctx, platformUserId, email);

  const { user } = await ensureUserByEmail(ctx, email, displayName);
  if (organizationId) {
    const member = await tenantsClient.getMember(ctx, organizationId, user._id);
    if (member) {
      await tenantsClient.removeMember(ctx, platformUserId, organizationId, user._id);
    }
  }

  await ctx.db.patch(user._id, {
    onboardingStatus: undefined,
    invitedAt: undefined,
    activatedAt: undefined,
  });

  return user;
}

export async function seedOrgMember(
  ctx: MutationCtx,
  platformUserId: Id<'users'>,
  organizationId: string,
  memberUserId: Id<'users'>,
  role: 'admin' | 'member'
) {
  const existing = await tenantsClient.getMember(ctx, organizationId, memberUserId);
  if (!existing) {
    await tenantsClient.addMember(ctx, platformUserId, organizationId, memberUserId, role);
  } else if (existing.role !== role) {
    await tenantsClient.updateMemberRole(ctx, platformUserId, organizationId, memberUserId, role);
  }

  const tenantAuthz = authz.withTenant(organizationId);
  const hasRole = await tenantAuthz.hasRole(ctx, memberUserId, role, orgScope(organizationId));
  if (!hasRole) {
    await tenantAuthz.assignRole(
      ctx,
      memberUserId,
      role,
      orgScope(organizationId),
      undefined,
      platformUserId
    );
  } else {
    await tenantAuthz.recomputeUser(ctx, memberUserId);
  }

  await seedActiveUser(ctx, memberUserId);
}

async function seedDraftInvitation(
  ctx: MutationCtx,
  platformUserId: Id<'users'>,
  organizationId: string,
  email: string,
  role: 'admin' | 'member'
) {
  await cancelPendingInvitationsForOrgEmail(ctx, platformUserId, organizationId, email);
  const { user } = await ensureUserByEmail(ctx, email);
  await markUserPending(ctx, user._id);
  await tenantsClient.inviteMember(ctx, platformUserId, organizationId, email, role, {
    identifierType: 'email',
  });
  return user;
}

async function seedOrgTodos(
  ctx: MutationCtx,
  organizationId: string,
  userId: Id<'users'>,
  alphaTitle: string,
  betaTitle: string
) {
  const todos = await ctx.db
    .query('todos')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .collect();
  for (const todo of todos) {
    if (todo.title.startsWith(E2E_PREFIX)) {
      await ctx.db.delete(todo._id);
    }
  }

  const now = Date.now();
  const todoAlphaId = await ctx.db.insert('todos', {
    organizationId,
    userId,
    createdBy: userId,
    title: alphaTitle,
    description: 'Seeded todo for Cypress',
    priority: 'medium',
    completed: false,
    createdAt: now,
    updatedAt: now,
  });
  const todoBetaId = await ctx.db.insert('todos', {
    organizationId,
    userId,
    createdBy: userId,
    title: betaTitle,
    description: 'Second seeded todo for Cypress',
    priority: 'high',
    completed: false,
    createdAt: now - 1,
    updatedAt: now - 1,
  });
  return { todoAlphaId, todoBetaId };
}

export async function ensureOrganization(
  ctx: MutationCtx,
  platformUserId: Id<'users'>,
  name: string,
  slug: string
) {
  const existing = await tenantsClient.getOrganizationBySlug(ctx, slug);
  if (existing) {
    return existing._id;
  }
  return await tenantsClient.createOrganization(ctx, platformUserId, name, { slug });
}

async function prepareE2eReset(ctx: MutationCtx, platformUserId: Id<'users'>) {
  const orgA = await tenantsClient.getOrganizationBySlug(ctx, ORG_A_SLUG);
  const orgB = await tenantsClient.getOrganizationBySlug(ctx, ORG_B_SLUG);
  const orgIds = [orgA?._id, orgB?._id].filter((id): id is string => Boolean(id));

  for (const organizationId of orgIds) {
    for (const email of E2E_INVITE_EMAILS) {
      await cancelPendingInvitationsForOrgEmail(ctx, platformUserId, organizationId, email);
    }
  }

  for (const email of E2E_INVITE_EMAILS) {
    await cancelPendingInvitationsForEmail(ctx, platformUserId, email);
  }

  await resetInviteeUser(
    ctx,
    platformUserId,
    orgA?._id ?? null,
    PENDING_USER_EMAIL,
    'Pending User'
  );
  await resetInviteeUser(
    ctx,
    platformUserId,
    orgA?._id ?? null,
    INVITED_USER_EMAIL,
    'Invited User'
  );
  await resetInviteeUser(
    ctx,
    platformUserId,
    orgA?._id ?? null,
    E2E_IMMEDIATE_EMAIL,
    'E2E Immediate User'
  );
}

async function ensureInvitationWithEmail(
  ctx: MutationCtx,
  platformUserId: Id<'users'>,
  organizationId: string,
  organizationName: string,
  email: string,
  role: 'admin' | 'member'
) {
  await cancelPendingInvitationsForOrgEmail(ctx, platformUserId, organizationId, email);

  const invitation = await tenantsClient.inviteMember(
    ctx,
    platformUserId,
    organizationId,
    email,
    role,
    {
      identifierType: 'email',
    }
  );

  await sendInvitationEmail(ctx, {
    inviteeIdentifier: invitation.inviteeIdentifier,
    organizationName,
    invitationId: invitation.invitationId,
  });

  return invitation;
}

export const FIRST_SETUP_ORG_NAME = 'Acme Corp';
export const FIRST_SETUP_ORG_SLUG = 'acme-corp';
export const FIRST_SETUP_TODO_ALPHA = 'Welcome to Acme Corp';
export const FIRST_SETUP_TODO_BETA = 'Try creating a todo';

const FIRST_SETUP_USERS = [
  { email: DEV_ADMIN_EMAIL, name: 'Dev User' },
  { email: PLATFORM_ADMIN_EMAIL, name: 'Platform Admin' },
  { email: GOOGLE_EMULATE_DEFAULT_EMAIL, name: 'Test User' },
] as const;

async function provisionFirstSetupUser(ctx: MutationCtx, email: string, name: string) {
  const { user, created } = await ensureUserByEmail(ctx, email, name);
  await seedActiveUser(ctx, user._id);
  await bootstrapPlatformAdmin(ctx, user._id);
  return { user, created };
}

async function seedFirstSetupTodos(ctx: MutationCtx, organizationId: string, userId: Id<'users'>) {
  const existing = await ctx.db
    .query('todos')
    .withIndex('by_org', (q) => q.eq('organizationId', organizationId))
    .collect();
  const titles = new Set(existing.map((todo) => todo.title));
  const now = Date.now();
  const specs = [
    {
      title: FIRST_SETUP_TODO_ALPHA,
      description: 'Seeded so the dashboard is ready after first setup',
      priority: 'medium' as const,
      createdAt: now,
    },
    {
      title: FIRST_SETUP_TODO_BETA,
      description: 'Second seeded todo for the first-setup organization',
      priority: 'high' as const,
      createdAt: now - 1,
    },
  ];

  for (const spec of specs) {
    if (titles.has(spec.title)) {
      continue;
    }
    await ctx.db.insert('todos', {
      organizationId,
      userId,
      createdBy: userId,
      title: spec.title,
      description: spec.description,
      priority: spec.priority,
      completed: false,
      createdAt: spec.createdAt,
      updatedAt: spec.createdAt,
    });
  }
}

/** Seeds first-setup emulator users and a ready-to-use organization. */
export const seedAdminUser = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const seeded: Array<{ user: { _id: Id<'users'>; email?: string }; created: boolean }> = [];
    for (const persona of FIRST_SETUP_USERS) {
      const displayName = persona.email === DEV_ADMIN_EMAIL ? name : persona.name;
      seeded.push(await provisionFirstSetupUser(ctx, persona.email, displayName));
    }

    const platform = seeded.find((entry) => entry.user.email === PLATFORM_ADMIN_EMAIL) ?? seeded[0];
    const dev = seeded.find((entry) => entry.user.email === DEV_ADMIN_EMAIL) ?? platform;
    if (!platform || !dev) {
      throw new Error('First-setup seed did not create the Dev User');
    }

    const organizationId = await ensureOrganization(
      ctx,
      platform.user._id,
      FIRST_SETUP_ORG_NAME,
      FIRST_SETUP_ORG_SLUG
    );
    for (const entry of seeded) {
      await seedOrgMember(ctx, platform.user._id, organizationId, entry.user._id, 'admin');
    }
    await seedFirstSetupTodos(ctx, organizationId, dev.user._id);

    return {
      _id: dev.user._id,
      action: dev.created ? ('created' as const) : ('promoted' as const),
      organizationId,
      organizationName: FIRST_SETUP_ORG_NAME,
      organizationSlug: FIRST_SETUP_ORG_SLUG,
    };
  },
});

/** Resets Cypress fixture data for multi-tenant e2e. */
export const reset = internalMutation({
  args: { userId: v.optional(v.id('users')) },
  handler: async (ctx, args) => {
    const { user: platformUser } = await ensureUserByEmail(
      ctx,
      PLATFORM_ADMIN_EMAIL,
      'Platform Admin'
    );
    await bootstrapPlatformAdmin(ctx, platformUser._id);
    await prepareE2eReset(ctx, platformUser._id);

    const { user: orgAAdmin } = await ensureUserByEmail(ctx, ORG_A_ADMIN_EMAIL, 'Org A Admin');
    const { user: orgAMember } = await ensureUserByEmail(ctx, ORG_A_MEMBER_EMAIL, 'Org A Member');
    const { user: orgBAdmin } = await ensureUserByEmail(ctx, ORG_B_ADMIN_EMAIL, 'Org B Admin');
    const { user: orgBMember } = await ensureUserByEmail(ctx, ORG_B_MEMBER_EMAIL, 'Org B Member');
    const { user: devAdmin } = await ensureUserByEmail(ctx, DEV_ADMIN_EMAIL, 'Dev User');

    const orgAId = await ensureOrganization(ctx, platformUser._id, ORG_A_NAME, ORG_A_SLUG);
    const orgBId = await ensureOrganization(ctx, platformUser._id, ORG_B_NAME, ORG_B_SLUG);

    await seedOrgMember(ctx, platformUser._id, orgAId, orgAAdmin._id, 'admin');
    await seedOrgMember(ctx, platformUser._id, orgAId, orgAMember._id, 'member');
    await seedOrgMember(ctx, platformUser._id, orgAId, devAdmin._id, 'admin');
    await seedOrgMember(ctx, platformUser._id, orgBId, orgBAdmin._id, 'admin');
    await seedOrgMember(ctx, platformUser._id, orgBId, orgBMember._id, 'member');

    await seedDraftInvitation(ctx, platformUser._id, orgAId, PENDING_USER_EMAIL, 'member');

    const { user: invitedUser } = await ensureUserByEmail(ctx, INVITED_USER_EMAIL, 'Invited User');
    await markUserPending(ctx, invitedUser._id);
    const invitation = await ensureInvitationWithEmail(
      ctx,
      platformUser._id,
      orgAId,
      ORG_A_NAME,
      INVITED_USER_EMAIL,
      'member'
    );
    await markUserInvited(ctx, invitedUser._id);

    const orgATodos = await seedOrgTodos(
      ctx,
      orgAId,
      orgAAdmin._id,
      ORG_A_TODO_ALPHA,
      ORG_A_TODO_BETA
    );
    const orgBTodos = await seedOrgTodos(
      ctx,
      orgBId,
      orgBAdmin._id,
      ORG_B_TODO_ALPHA,
      ORG_B_TODO_BETA
    );

    return {
      adminEmail: DEV_ADMIN_EMAIL,
      todoAlphaId: orgATodos.todoAlphaId,
      todoAlphaTitle: ORG_A_TODO_ALPHA,
      todoBetaId: orgATodos.todoBetaId,
      todoBetaTitle: ORG_A_TODO_BETA,
      orgAId,
      orgAName: ORG_A_NAME,
      orgASlug: ORG_A_SLUG,
      orgAAdminEmail: ORG_A_ADMIN_EMAIL,
      orgAMemberEmail: ORG_A_MEMBER_EMAIL,
      orgATodoAlphaTitle: ORG_A_TODO_ALPHA,
      orgATodoBetaTitle: ORG_A_TODO_BETA,
      orgBId,
      orgBName: ORG_B_NAME,
      orgBSlug: ORG_B_SLUG,
      orgBAdminEmail: ORG_B_ADMIN_EMAIL,
      orgBMemberEmail: ORG_B_MEMBER_EMAIL,
      orgBTodoAlphaTitle: ORG_B_TODO_ALPHA,
      orgBTodoBetaTitle: ORG_B_TODO_BETA,
      orgBTodoAlphaId: orgBTodos.todoAlphaId,
      orgBTodoBetaId: orgBTodos.todoBetaId,
      platformAdminEmail: PLATFORM_ADMIN_EMAIL,
      pendingUserEmail: PENDING_USER_EMAIL,
      invitedUserEmail: INVITED_USER_EMAIL,
      invitationId: invitation.invitationId,
      invitationAcceptPath: `/accept-invitation/${invitation.invitationId}`,
      orgAdminEmail: ORG_A_ADMIN_EMAIL,
      memberEmail: ORG_A_MEMBER_EMAIL,
      orgId: orgAId,
      orgName: ORG_A_NAME,
      orgSlug: ORG_A_SLUG,
      seedUserId: args.userId ?? devAdmin._id,
    };
  },
});

/** E2E-only cross-org access probe for tenant isolation tests. */
export const probeOrgResource = query({
  args: { organizationId: v.string(), todoId: v.id('todos') },
  handler: async (ctx, args) => {
    if (process.env.E2E !== 'true') {
      throw new Error('probeOrgResource is only available when E2E=true');
    }

    const userId = await resolveActingUserId(ctx);
    if (!userId) {
      return { allowed: false as const, reason: 'unauthenticated' as const };
    }

    const scoped = getOrgScopedTodo(await ctx.db.get(args.todoId), args.organizationId);
    if (!scoped) {
      return { allowed: false as const, reason: 'not_found' as const };
    }

    const allowed = await canAccessOrgTodo(
      ctx,
      args.organizationId,
      userId,
      scoped.createdBy,
      'read'
    );
    return allowed
      ? {
          allowed: true as const,
          title: scoped.todo.title,
          organizationId: scoped.todo.organizationId,
        }
      : { allowed: false as const, reason: 'denied' as const };
  },
});
