import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPlatformAdmin, requireUserId, resolveActingUserId } from './auth';
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
