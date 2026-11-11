import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { getHospitalAccess, requireHospitalAccess } from './lib/hospitalAccess';
import { MEDICATION_ROUTES, URGENCY_RANK, type RequestStatus } from './lib/medicationOptions';

const MAX_SECTORS = 50;
const MAX_BEDS_PER_SECTOR = 100;
const MAX_REQUESTS = 300;

const urgencyValidator = v.union(
  v.literal('urgente'),
  v.literal('prioritario'),
  v.literal('rotina')
);

/** Sectors of a hospital, each with its beds, in display order. */
export const listSectorsWithBeds = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    if (!(await getHospitalAccess(ctx, organizationId))) {
      return [];
    }
    const sectors = await ctx.db
      .query('sectors')
      .withIndex('by_org_and_sortOrder', (q) => q.eq('organizationId', organizationId))
      .take(MAX_SECTORS);

    return await Promise.all(
      sectors.map(async (sector) => {
        const beds = await ctx.db
          .query('beds')
          .withIndex('by_org_and_sector_and_sortOrder', (q) =>
            q.eq('organizationId', organizationId).eq('sectorId', sector._id)
          )
          .take(MAX_BEDS_PER_SECTOR);
        return {
          _id: sector._id,
          name: sector.name,
          beds: beds.map((bed) => ({ _id: bed._id, label: bed.label })),
        };
      })
    );
  },
});

/**
 * Every request of a hospital, most urgent first and, within the same urgency, oldest first.
 * Sector and bed names are joined in so screens never show a bare ID.
 */
export const listRequests = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    if (!(await getHospitalAccess(ctx, organizationId))) {
      return [];
    }
    const requests = await ctx.db
      .query('medicationRequests')
      .withIndex('by_org_and_urgencyRank', (q) => q.eq('organizationId', organizationId))
      .take(MAX_REQUESTS);

    const sectorNames = new Map<Id<'sectors'>, string>();
    const bedLabels = new Map<Id<'beds'>, string>();
    for (const request of requests) {
      if (!sectorNames.has(request.sectorId)) {
        sectorNames.set(request.sectorId, (await ctx.db.get(request.sectorId))?.name ?? '—');
      }
      if (!bedLabels.has(request.bedId)) {
        bedLabels.set(request.bedId, (await ctx.db.get(request.bedId))?.label ?? '—');
      }
    }

    return requests.map((request) => ({
      _id: request._id,
      sectorId: request.sectorId,
      bedId: request.bedId,
      sectorName: sectorNames.get(request.sectorId) ?? '—',
      bedLabel: bedLabels.get(request.bedId) ?? '—',
      medication: request.medication,
      quantity: request.quantity,
      dose: request.dose,
      route: request.route,
      urgency: request.urgency,
      notes: request.notes ?? null,
      status: request.status,
      refusalReason: request.refusalReason ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }));
  },
});

export const createRequest = mutation({
  args: {
    organizationId: v.string(),
    bedId: v.id('beds'),
    medication: v.string(),
    quantity: v.number(),
    dose: v.string(),
    route: v.string(),
    urgency: urgencyValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireHospitalAccess(ctx, args.organizationId);

    const bed = await ctx.db.get(args.bedId);
    if (!bed || bed.organizationId !== args.organizationId) {
      throw new Error('Leito não encontrado neste hospital');
    }
    const medication = args.medication.trim();
    const dose = args.dose.trim();
    const notes = args.notes?.trim();
    if (!medication) {
      throw new Error('Informe o medicamento');
    }
    if (!dose) {
      throw new Error('Informe a dose');
    }
    if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 999) {
      throw new Error('A quantidade deve ser um número inteiro entre 1 e 999');
    }
    if (!(MEDICATION_ROUTES as ReadonlyArray<string>).includes(args.route)) {
      throw new Error('Via de administração inválida');
    }

    const now = Date.now();
    return await ctx.db.insert('medicationRequests', {
      organizationId: args.organizationId,
      sectorId: bed.sectorId,
      bedId: bed._id,
      medication,
      quantity: args.quantity,
      dose,
      route: args.route,
      urgency: args.urgency,
      urgencyRank: URGENCY_RANK[args.urgency],
      notes: notes ? notes : undefined,
      status: 'solicitado',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function loadRequestForTransition(
  ctx: MutationCtx,
  organizationId: string,
  requestId: Id<'medicationRequests'>,
  allowedFrom: ReadonlyArray<RequestStatus>,
  errorMessage: string
): Promise<Doc<'medicationRequests'>> {
  await requireHospitalAccess(ctx, organizationId);
  const request = await ctx.db.get(requestId);
  if (!request || request.organizationId !== organizationId) {
    throw new Error('Solicitação não encontrada');
  }
  if (!allowedFrom.includes(request.status)) {
    throw new Error(errorMessage);
  }
  return request;
}

const transitionArgs = {
  organizationId: v.string(),
  requestId: v.id('medicationRequests'),
};

/** Farmácia: Solicitado → Em separação. */
export const startSeparation = mutation({
  args: transitionArgs,
  handler: async (ctx, { organizationId, requestId }) => {
    await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['solicitado'],
      'Só é possível separar uma solicitação que ainda está como "Solicitado"'
    );
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'em_separacao',
      separationStartedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Farmácia: Em separação → Enviado. */
export const markSent = mutation({
  args: transitionArgs,
  handler: async (ctx, { organizationId, requestId }) => {
    await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['em_separacao'],
      'Só é possível enviar uma solicitação que está "Em separação"'
    );
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'enviado',
      sentAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Farmácia: Solicitado ou Em separação → Recusado, with a reason the nursing team will see. */
export const refuse = mutation({
  args: { ...transitionArgs, reason: v.string() },
  handler: async (ctx, { organizationId, requestId, reason }) => {
    await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['solicitado', 'em_separacao'],
      'Só é possível recusar uma solicitação antes de ela ser enviada'
    );
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error('Informe o motivo da recusa');
    }
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'recusado',
      refusalReason: trimmed,
      refusedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Enfermagem: Enviado → Recebido, confirming the medication reached the bed. */
export const confirmReceived = mutation({
  args: transitionArgs,
  handler: async (ctx, { organizationId, requestId }) => {
    await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['enviado'],
      'Só é possível confirmar o recebimento de uma solicitação "Enviada"'
    );
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'recebido',
      receivedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
