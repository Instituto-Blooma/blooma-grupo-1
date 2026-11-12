import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { getHospitalAccess, requireHospitalAccess } from './lib/hospitalAccess';
import {
  MAX_DEVICE_ID_LENGTH,
  MEDICATION_ROUTES,
  PHARMACEUTICAL_FORMS,
  URGENCY_RANK,
  type RequestStatus,
} from './lib/medicationOptions';

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
 * Queue order: most urgent first; within the same urgency, the nearest deadline first, and
 * requests without a deadline last (oldest first among them).
 */
function compareQueueOrder(left: Doc<'medicationRequests'>, right: Doc<'medicationRequests'>) {
  if (left.urgencyRank !== right.urgencyRank) {
    return left.urgencyRank - right.urgencyRank;
  }
  const leftDeadline = left.deadline ?? Number.POSITIVE_INFINITY;
  const rightDeadline = right.deadline ?? Number.POSITIVE_INFINITY;
  if (leftDeadline !== rightDeadline) {
    return leftDeadline - rightDeadline;
  }
  return left.createdAt - right.createdAt;
}

/**
 * Every request of a hospital in queue order (see compareQueueOrder), with the time of each
 * step for the history timeline. Sector and bed names are joined in so screens never show an ID.
 */
export const listRequests = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    if (!(await getHospitalAccess(ctx, organizationId))) {
      return [];
    }
    const requests = (
      await ctx.db
        .query('medicationRequests')
        .withIndex('by_org_and_urgencyRank', (q) => q.eq('organizationId', organizationId))
        .take(MAX_REQUESTS)
    ).toSorted(compareQueueOrder);

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
      number: request.number ?? null,
      sectorId: request.sectorId,
      bedId: request.bedId,
      sectorName: sectorNames.get(request.sectorId) ?? '—',
      bedLabel: bedLabels.get(request.bedId) ?? '—',
      medication: request.medication,
      concentration: request.concentration ?? null,
      pharmaceuticalForm: request.pharmaceuticalForm ?? null,
      quantity: request.quantity,
      dose: request.dose,
      route: request.route,
      urgency: request.urgency,
      notes: request.notes ?? null,
      deadline: request.deadline ?? null,
      status: request.status,
      refusalReason: request.refusalReason ?? null,
      refusalAcknowledgedAt: request.refusalAcknowledgedAt ?? null,
      acceptedByDevice: request.acceptedByDevice ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      separationStartedAt: request.separationStartedAt ?? null,
      sentAt: request.sentAt ?? null,
      receivedAt: request.receivedAt ?? null,
      refusedAt: request.refusedAt ?? null,
    }));
  },
});

/** Next "Solicitação N" for a hospital. Runs inside the creating mutation, so it is race-free. */
export async function nextRequestNumber(ctx: MutationCtx, organizationId: string) {
  const last = await ctx.db
    .query('medicationRequests')
    .withIndex('by_org_and_number', (q) => q.eq('organizationId', organizationId))
    .order('desc')
    .first();
  return (last?.number ?? 0) + 1;
}

export const createRequest = mutation({
  args: {
    organizationId: v.string(),
    bedId: v.id('beds'),
    medication: v.string(),
    concentration: v.string(),
    pharmaceuticalForm: v.string(),
    quantity: v.number(),
    dose: v.string(),
    route: v.string(),
    urgency: urgencyValidator,
    notes: v.optional(v.string()),
    deadline: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireHospitalAccess(ctx, args.organizationId);
    if (args.deadline !== undefined && !Number.isFinite(args.deadline)) {
      throw new Error('Data e horário limite inválidos');
    }

    const bed = await ctx.db.get(args.bedId);
    if (!bed || bed.organizationId !== args.organizationId) {
      throw new Error('Leito não encontrado neste hospital');
    }
    const medication = args.medication.trim();
    const concentration = args.concentration.trim();
    const dose = args.dose.trim();
    const notes = args.notes?.trim();
    if (!medication) {
      throw new Error('Informe o nome do medicamento');
    }
    if (!concentration) {
      throw new Error('Informe a concentração');
    }
    if (!(PHARMACEUTICAL_FORMS as ReadonlyArray<string>).includes(args.pharmaceuticalForm)) {
      throw new Error('Forma farmacêutica inválida');
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
    const number = await nextRequestNumber(ctx, args.organizationId);
    await ctx.db.insert('medicationRequests', {
      organizationId: args.organizationId,
      number,
      sectorId: bed.sectorId,
      bedId: bed._id,
      medication,
      concentration,
      pharmaceuticalForm: args.pharmaceuticalForm,
      quantity: args.quantity,
      dose,
      route: args.route,
      urgency: args.urgency,
      urgencyRank: URGENCY_RANK[args.urgency],
      notes: notes ? notes : undefined,
      deadline: args.deadline,
      status: 'solicitado',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return { number };
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

function requireDeviceId(deviceId: string) {
  const trimmed = deviceId.trim();
  if (!trimmed || trimmed.length > MAX_DEVICE_ID_LENGTH) {
    throw new Error('Aparelho não identificado. Recarregue a página e tente de novo.');
  }
  return trimmed;
}

const IN_PROGRESS_ELSEWHERE =
  'Solicitação em andamento: ela já foi aceita por outro aparelho da farmácia.';

/**
 * Farmácia: Solicitado → Em preparação. The accepting device "holds" the request; if two
 * devices accept at the same time, Convex runs the mutations one after the other, so the second
 * one sees "em_separacao" and fails.
 */
export const acceptRequest = mutation({
  args: { ...transitionArgs, deviceId: v.string() },
  handler: async (ctx, { organizationId, requestId, deviceId }) => {
    const device = requireDeviceId(deviceId);
    await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['solicitado'],
      IN_PROGRESS_ELSEWHERE
    );
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'em_separacao',
      acceptedByDevice: device,
      separationStartedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Farmácia (only the device that accepted): Em preparação → Enviado. */
export const markSent = mutation({
  args: { ...transitionArgs, deviceId: v.string() },
  handler: async (ctx, { organizationId, requestId, deviceId }) => {
    const device = requireDeviceId(deviceId);
    const request = await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['em_separacao'],
      'Só é possível enviar uma solicitação que está "Em preparação"'
    );
    if (request.acceptedByDevice && request.acceptedByDevice !== device) {
      throw new Error(IN_PROGRESS_ELSEWHERE);
    }
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'enviado',
      sentAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Farmácia: Rejeitar, with a justification the nursing team will see. Allowed while the request
 * is still "Solicitado", or "Em preparação" by the device that accepted it.
 */
export const refuse = mutation({
  args: { ...transitionArgs, reason: v.string(), deviceId: v.string() },
  handler: async (ctx, { organizationId, requestId, reason, deviceId }) => {
    const device = requireDeviceId(deviceId);
    const request = await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['solicitado', 'em_separacao'],
      'Só é possível rejeitar uma solicitação antes de ela ser enviada'
    );
    if (
      request.status === 'em_separacao' &&
      request.acceptedByDevice &&
      request.acceptedByDevice !== device
    ) {
      throw new Error(IN_PROGRESS_ELSEWHERE);
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error('Escreva a justificativa da rejeição');
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

/** Enfermagem: "Ciente" on a rejected request, moving it from "Acompanhar entregas" to Histórico. */
export const acknowledgeRefusal = mutation({
  args: transitionArgs,
  handler: async (ctx, { organizationId, requestId }) => {
    const request = await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['recusado'],
      'Só é possível marcar como ciente uma solicitação rejeitada'
    );
    if (request.refusalAcknowledgedAt === undefined) {
      await ctx.db.patch('medicationRequests', requestId, { refusalAcknowledgedAt: Date.now() });
    }
    return null;
  },
});
