import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { authz } from '../authz';
import { isPlatformAdmin, orgScope, requireUserId } from './auth';

type TodoPermission = 'todos:create' | 'todos:read' | 'todos:update' | 'todos:delete';
type TodoAccessAction = 'read' | 'update' | 'delete';

export function getOrgScopedTodo(todo: Doc<'todos'> | null, organizationId: string) {
  if (!todo || todo.organizationId !== organizationId || !todo.createdBy) {
    return null;
  }
  return {
    todo,
    createdBy: todo.createdBy,
  };
}

export async function requireOrgPermission(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  permission: TodoPermission,
  userId?: Id<'users'>
) {
  const resolvedUserId = userId ?? (await requireUserId(ctx));
  if (await isPlatformAdmin(ctx, resolvedUserId)) {
    return resolvedUserId;
  }
  await authz
    .withTenant(organizationId)
    .require(ctx, resolvedUserId, permission, orgScope(organizationId));
  return resolvedUserId;
}

export async function canAccessOrgTodo(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  userId: Id<'users'>,
  createdBy: Id<'users'>,
  action: TodoAccessAction
) {
  if (await isPlatformAdmin(ctx, userId)) {
    return true;
  }
  const permission = `todos:${action}` as const;
  const tenantAuthz = authz.withTenant(organizationId);
  const allowed = await tenantAuthz.can(ctx, userId, permission, orgScope(organizationId));
  if (!allowed) {
    return false;
  }
  if (action === 'read') {
    return true;
  }
  const isAdmin = await tenantAuthz.hasRole(ctx, userId, 'admin', orgScope(organizationId));
  if (isAdmin) {
    return true;
  }
  return createdBy === userId;
}

export async function requireOrgTodoAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  todoId: Id<'todos'>,
  action: TodoAccessAction
) {
  const userId = await requireUserId(ctx);
  const scoped = getOrgScopedTodo(await ctx.db.get(todoId), organizationId);
  if (!scoped) {
    throw new Error('Tarefa não encontrada');
  }
  const allowed = await canAccessOrgTodo(ctx, organizationId, userId, scoped.createdBy, action);
  if (!allowed) {
    throw new Error('Permissão negada');
  }
  return { userId, scoped };
}
