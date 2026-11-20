import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { authz } from '../authz';
import { isPlatformAdmin, orgScope, requireUserId, resolveActingUserId } from './auth';
import { tenantsClient } from './tenantsClient';

/**
 * A hospital is an Organization. Anyone who is an active member of it (the hospital's shared
 * account) can use both profiles, Enfermagem and Farmácia; platform admins can see every hospital.
 */
async function isHospitalMember(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  userId: Id<'users'>
) {
  if (await isPlatformAdmin(ctx, userId)) {
    return true;
  }
  const member = await tenantsClient.getMember(ctx, organizationId, userId);
  return Boolean(member) && member?.status !== 'suspended';
}

export async function requireHospitalAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
): Promise<Id<'users'>> {
  const userId = await requireUserId(ctx);
  if (!(await isHospitalMember(ctx, organizationId, userId))) {
    throw new Error('Sem acesso a este hospital');
  }
  return userId;
}

/**
 * Changing the hospital's structure (sectors and beds) needs the same permission as the other
 * settings pages: `settings:manage` (the hospital account is the organization's admin).
 */
export async function requireHospitalSettingsAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
): Promise<Id<'users'>> {
  const userId = await requireHospitalAccess(ctx, organizationId);
  if (await isPlatformAdmin(ctx, userId)) {
    return userId;
  }
  const allowed = await authz
    .withTenant(organizationId)
    .can(ctx, userId, 'settings:manage', orgScope(organizationId));
  if (!allowed) {
    throw new Error('Só a administração do hospital pode alterar setores e leitos');
  }
  return userId;
}

/** For queries: returns null instead of throwing when signed out or not a member. */
export async function getHospitalAccess(
  ctx: QueryCtx,
  organizationId: string
): Promise<Id<'users'> | null> {
  const userId = await resolveActingUserId(ctx);
  if (!userId || !(await isHospitalMember(ctx, organizationId, userId))) {
    return null;
  }
  return userId;
}
