import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { MAX_BEDS_PER_SECTOR, MAX_SECTORS, isActive } from './hospitalStructure';
import { findControlledSubstance } from './lib/controlledSubstances';
import { getHospitalAccess, requireHospitalAccess } from './lib/hospitalAccess';
import {
  MAX_DEVICE_ID_LENGTH,
  MEDICATION_ROUTES,
  PHARMACEUTICAL_FORMS,
  URGENCY_RANK,
  type RequestStatus,
} from './lib/medicationOptions';

const MAX_REQUESTS = 300;

const urgencyValidator = v.union(
  v.literal('urgente'),
  v.literal('prioritario'),
  v.literal('rotina')
);

/**
 * Active sectors of a hospital, each with its active beds, in display order. Deactivated ones
 * (see hospitalStructure.ts) stay out of the filter and the request form.
 */
export const listSectorsWithBeds = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    if (!(await getHospitalAccess(ctx, organizationId))) {
      return [];
    }
    const sectors = (
      await ctx.db
        .query('sectors')
        .withIndex('by_org_and_sortOrder', (q) => q.eq('organizationId', organizationId))
        .take(MAX_SECTORS * 2)
    ).filter(isActive);

    return await Promise.all(
      sectors.map(async (sector) => {
        const beds = (
          await ctx.db
            .query('beds')
            .withIndex('by_org_and_sector_and_sortOrder', (q) =>
              q.eq('organizationId', organizationId).eq('sectorId', sector._id)
            )
            .take(MAX_BEDS_PER_SECTOR * 2)
        ).filter(isActive);
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
  // A reported delivery error goes before everything else: the patient already waited once.
  const leftRedo = left.needsRedelivery === true ? 0 : 1;
  const rightRedo = right.needsRedelivery === true ? 0 : 1;
  if (leftRedo !== rightRedo) {
    return leftRedo - rightRedo;
  }
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
      itemIndex: request.itemIndex ?? 1,
      itemCount: request.itemCount ?? 1,
      requesterName: request.requesterName ?? null,
      requesterCoren: request.requesterCoren ?? null,
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
      acceptedByName: request.acceptedByName ?? null,
      refrigerated: request.refrigerated === true,
      needsRedelivery: request.needsRedelivery === true,
      deliveryErrors: request.deliveryErrors ?? [],
      acceptedByCrf: request.acceptedByCrf ?? null,
      controlledList: request.controlledList ?? null,
      prescriptionNumber: request.prescriptionNumber ?? null,
      prescriberName: request.prescriberName ?? null,
      prescriberCrm: request.prescriberCrm ?? null,
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

const MAX_ITEMS_PER_PRESCRIPTION = 20;
const MAX_IDENTIFICATION_LENGTH = 80;

const itemValidator = v.object({
  medication: v.string(),
  concentration: v.string(),
  pharmaceuticalForm: v.string(),
  quantity: v.number(),
  dose: v.string(),
  route: v.string(),
  urgency: urgencyValidator,
  notes: v.optional(v.string()),
  deadline: v.optional(v.number()),
  // Only used (and then required) when the medication is controlled.
  prescription: v.optional(
    v.object({ number: v.string(), prescriberName: v.string(), prescriberCrm: v.string() })
  ),
});

function cleanItem(item: typeof itemValidator.type, position: number, total: number) {
  const label = total > 1 ? ` (medicamento ${position})` : '';
  const medication = item.medication.trim();
  const concentration = item.concentration.trim();
  const dose = item.dose.trim();
  const notes = item.notes?.trim();
  if (!medication) {
    throw new Error(`Informe o nome do medicamento${label}`);
  }
  if (!concentration) {
    throw new Error(`Informe a concentração${label}`);
  }
  if (!(PHARMACEUTICAL_FORMS as ReadonlyArray<string>).includes(item.pharmaceuticalForm)) {
    throw new Error(`Forma farmacêutica inválida${label}`);
  }
  if (!dose) {
    throw new Error(`Informe a dose prescrita${label}`);
  }
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
    throw new Error(`A quantidade deve ser um número inteiro entre 1 e 999${label}`);
  }
  if (!(MEDICATION_ROUTES as ReadonlyArray<string>).includes(item.route)) {
    throw new Error(`Via de administração inválida${label}`);
  }
  if (item.deadline !== undefined && !Number.isFinite(item.deadline)) {
    throw new Error(`Data e horário limite inválidos${label}`);
  }
  const controlled = findControlledSubstance(medication);
  const prescription = controlled
    ? {
        prescriptionNumber: cleanIdentification(
          item.prescription?.number ?? '',
          'Número da receita',
          `${medication} é controlado (${controlled.prescriptionType}): informe o número da receita${label}`
        ),
        prescriberName: cleanIdentification(
          item.prescription?.prescriberName ?? '',
          'Nome do médico',
          `Informe o nome do médico que prescreveu${label}`
        ),
        prescriberCrm: cleanIdentification(
          item.prescription?.prescriberCrm ?? '',
          'Nº de identificação do médico',
          `Informe o número de identificação do médico${label}`
        ),
      }
    : {};
  return {
    ...item,
    medication,
    concentration,
    dose,
    notes: notes ? notes : undefined,
    controlledList: controlled?.list,
    ...prescription,
  };
}

function cleanIdentification(value: string, label: string, missingMessage: string) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    throw new Error(missingMessage);
  }
  if (trimmed.length > MAX_IDENTIFICATION_LENGTH) {
    throw new Error(`${label} pode ter até ${MAX_IDENTIFICATION_LENGTH} caracteres`);
  }
  return trimmed;
}

/**
 * Enfermagem: one prescription ("Solicitação N") with one or more medications for the same bed.
 * Each medication becomes its own item with its own urgency, deadline and status, sharing the
 * number, bed and the identification of the professional who asked.
 */
export const createPrescription = mutation({
  args: {
    organizationId: v.string(),
    bedId: v.id('beds'),
    requesterName: v.string(),
    requesterCoren: v.string(),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireHospitalAccess(ctx, args.organizationId);
    const requesterName = cleanIdentification(args.requesterName, 'Nome', 'Informe o nome');
    const requesterCoren = cleanIdentification(
      args.requesterCoren,
      'Nº de identificação',
      'Informe o número de identificação'
    );
    if (args.items.length === 0) {
      throw new Error('Adicione pelo menos um medicamento');
    }
    if (args.items.length > MAX_ITEMS_PER_PRESCRIPTION) {
      throw new Error(`Uma prescrição pode ter até ${MAX_ITEMS_PER_PRESCRIPTION} medicamentos`);
    }

    const bed = await ctx.db.get(args.bedId);
    if (!bed || bed.organizationId !== args.organizationId) {
      throw new Error('Leito não encontrado neste hospital');
    }
    const bedSector = await ctx.db.get(bed.sectorId);
    if (!isActive(bed) || !bedSector || !isActive(bedSector)) {
      throw new Error('Este leito está desativado. Escolha outro leito.');
    }
    const items = args.items.map((item, index) => cleanItem(item, index + 1, args.items.length));

    const now = Date.now();
    const number = await nextRequestNumber(ctx, args.organizationId);
    for (const [index, item] of items.entries()) {
      await ctx.db.insert('medicationRequests', {
        organizationId: args.organizationId,
        number,
        itemIndex: index + 1,
        itemCount: items.length,
        requesterName,
        requesterCoren,
        sectorId: bed.sectorId,
        bedId: bed._id,
        medication: item.medication,
        concentration: item.concentration,
        pharmaceuticalForm: item.pharmaceuticalForm,
        quantity: item.quantity,
        dose: item.dose,
        route: item.route,
        urgency: item.urgency,
        urgencyRank: URGENCY_RANK[item.urgency],
        notes: item.notes,
        deadline: item.deadline,
        controlledList: item.controlledList,
        prescriptionNumber: item.prescriptionNumber,
        prescriberName: item.prescriberName,
        prescriberCrm: item.prescriberCrm,
        status: 'solicitado',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { number, itemCount: items.length };
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

/** Every item of the prescription that `request` belongs to (just itself for old requests). */
async function prescriptionItems(ctx: MutationCtx, request: Doc<'medicationRequests'>) {
  if (request.number === undefined) {
    return [request];
  }
  return await ctx.db
    .query('medicationRequests')
    .withIndex('by_org_and_number', (q) =>
      q.eq('organizationId', request.organizationId).eq('number', request.number)
    )
    .take(MAX_ITEMS_PER_PRESCRIPTION * 2);
}

/**
 * Farmácia: accepts one medication of a prescription ("Solicitado" → "Em preparação"). The item is
 * held by this device, and the whole prescription shows "Solicitação em andamento" on the other
 * devices, so two pharmacists never work on the same prescription. If two devices accept at the
 * same time, Convex runs the mutations one after the other and the second one finds it held.
 */
export const acceptRequest = mutation({
  args: {
    ...transitionArgs,
    deviceId: v.string(),
    pharmacistName: v.string(),
    pharmacistCrf: v.string(),
  },
  handler: async (ctx, { organizationId, requestId, deviceId, pharmacistName, pharmacistCrf }) => {
    const device = requireDeviceId(deviceId);
    const acceptedByName = cleanIdentification(pharmacistName, 'Nome', 'Informe o nome');
    const acceptedByCrf = cleanIdentification(
      pharmacistCrf,
      'Nº de identificação',
      'Informe o número de identificação'
    );
    const request = await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['solicitado'],
      'Este medicamento não está mais aguardando a farmácia'
    );
    const items = await prescriptionItems(ctx, request);
    const heldElsewhere = items.some(
      (item) =>
        item.status === 'em_separacao' &&
        item.acceptedByDevice !== undefined &&
        item.acceptedByDevice !== device
    );
    if (heldElsewhere) {
      throw new Error(IN_PROGRESS_ELSEWHERE);
    }
    const now = Date.now();
    await ctx.db.patch('medicationRequests', request._id, {
      status: 'em_separacao',
      acceptedByDevice: device,
      acceptedByName,
      acceptedByCrf,
      separationStartedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Farmácia (only the device that accepted): Em preparação → Enviado. */
export const markSent = mutation({
  args: { ...transitionArgs, deviceId: v.string(), refrigerated: v.optional(v.boolean()) },
  handler: async (ctx, { organizationId, requestId, deviceId, refrigerated }) => {
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
      refrigerated: refrigerated === true,
      needsRedelivery: false,
      updatedAt: now,
    });
    return null;
  },
});

const MAX_DELIVERY_ERRORS = 20;
const MAX_REASON_LENGTH = 300;

/**
 * Enfermagem: "Reportar erro na entrega" on a medication marked as sent. It goes back to
 * "Solicitado" at the top of the pharmacy queue (any pharmacy device can accept it again) and the
 * error is kept for the history.
 */
export const reportDeliveryError = mutation({
  args: { ...transitionArgs, reason: v.string() },
  handler: async (ctx, { organizationId, requestId, reason }) => {
    const request = await loadRequestForTransition(
      ctx,
      organizationId,
      requestId,
      ['enviado'],
      'Só é possível reportar erro em um medicamento "Enviado"'
    );
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new Error('Descreva o erro na entrega');
    }
    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new Error(`A descrição pode ter até ${MAX_REASON_LENGTH} caracteres`);
    }
    const errors = request.deliveryErrors ?? [];
    if (errors.length >= MAX_DELIVERY_ERRORS) {
      throw new Error('Este medicamento já tem erros demais registrados. Faça um novo pedido.');
    }
    const now = Date.now();
    await ctx.db.patch('medicationRequests', requestId, {
      status: 'solicitado',
      needsRedelivery: true,
      deliveryErrors: [
        ...errors,
        {
          reason: trimmed,
          reportedAt: now,
          sentAt: request.sentAt,
          acceptedByName: request.acceptedByName,
        },
      ],
      acceptedByDevice: undefined,
      acceptedByName: undefined,
      acceptedByCrf: undefined,
      separationStartedAt: undefined,
      sentAt: undefined,
      refrigerated: undefined,
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
    const items = await prescriptionItems(ctx, request);
    const heldElsewhere = items.some(
      (item) =>
        item.status === 'em_separacao' &&
        item.acceptedByDevice !== undefined &&
        item.acceptedByDevice !== device
    );
    if (heldElsewhere) {
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
