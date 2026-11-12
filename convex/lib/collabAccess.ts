import { ConvexError } from 'convex/values';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPlatformAdmin, requireUserId } from './auth';
import { parseOrganizationIdFromDocumentId, parseOrganizationIdFromRoom } from './collabIds';
import { tenantsClient } from './tenantsClient';

export {
  orgDocumentId,
  orgTableRoom,
  parseOrganizationIdFromDocumentId,
  parseOrganizationIdFromRoom,
  presenceRoomForDocument,
} from './collabIds';

/**
 * Hot-path org membership check for collab pull/push/presence.
 * Uses indexed tenants membership instead of full authz.require so heartbeats
 * stay under Convex's 1s mutation budget.
 */
export async function requireOrgCollabAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
): Promise<Id<'users'>> {
  const userId = await requireUserId(ctx);
  if (await isPlatformAdmin(ctx, userId)) {
    return userId;
  }

  const member = await tenantsClient.getMember(ctx, organizationId, userId);
  if (!member) {
    throw new ConvexError('Você não é membro desta organização');
  }
  return userId;
}

export async function requireDocumentCollabAccess(
  ctx: QueryCtx | MutationCtx,
  documentId: string
): Promise<Id<'users'>> {
  return requireOrgCollabAccess(ctx, parseOrganizationIdFromDocumentId(documentId));
}

export async function requireRoomCollabAccess(
  ctx: QueryCtx | MutationCtx,
  room: string
): Promise<Id<'users'>> {
  return requireOrgCollabAccess(ctx, parseOrganizationIdFromRoom(room));
}
