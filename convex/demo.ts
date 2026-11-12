import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { PLATFORM_ADMIN_EMAIL, ensureOrganization, seedOrgMember } from './testing/e2e';
import { URGENCY_RANK, type RequestStatus, type Urgency } from './lib/medicationOptions';
import { ensureUserByEmail } from './lib/users';

/**
 * Demo data for the pitch: two fictional hospitals, each with one shared account (the hospital
 * login), sectors with explicitly named beds, and a few requests at different steps.
 * Safe to run again: a hospital that already has sectors is left as it is.
 * Requests already "Em preparação" are held by a pretend second pharmacy device, so the demo
 * shows the "Solicitação em andamento" lock.
 */

type DemoRequest = {
  sector: string;
  bed: string;
  medication: string;
  quantity: number;
  /** Concentration, e.g. "1 g"; dose and form come from DEMO_DETAILS by medication name. */
  dose: string;
  route: string;
  urgency: Urgency;
  status: RequestStatus;
  minutesAgo: number;
  notes?: string;
  refusalReason?: string;
  /** Minutes from now until the deadline; omit for "sem prazo". */
  deadlineInMinutes?: number;
};

type DemoHospital = {
  name: string;
  slug: string;
  accountEmail: string;
  sectors: ReadonlyArray<{ name: string; beds: number }>;
  requests: ReadonlyArray<DemoRequest>;
};

/** Pharmaceutical form and the dose the patient receives, per demo medication. */
const DEMO_DETAILS: Record<string, { form: string; dose: string }> = {
  Noradrenalina: { form: 'Injetável', dose: '8 ml em bomba de infusão' },
  Dipirona: { form: 'Injetável', dose: '2 ml' },
  Ceftriaxona: { form: 'Pó para reconstituição', dose: '1 frasco-ampola' },
  Enoxaparina: { form: 'Injetável', dose: '0,4 ml' },
  Omeprazol: { form: 'Cápsula', dose: '1 cápsula' },
  Losartana: { form: 'Comprimido', dose: '1 comprimido' },
  Paracetamol: { form: 'Comprimido', dose: '1 comprimido' },
  Amoxicilina: { form: 'Cápsula', dose: '10 cápsulas' },
  Salbutamol: { form: 'Spray / aerossol', dose: '2 jatos' },
  Ondansetrona: { form: 'Injetável', dose: '4 ml' },
  'Sulfato ferroso': { form: 'Comprimido', dose: '1 comprimido' },
};

/** Stands for a second pharmacy device, so the demo shows a request locked as "em andamento". */
const OTHER_PHARMACY_DEVICE = 'demo-outro-aparelho-da-farmacia';

export const DEMO_HOSPITALS: ReadonlyArray<DemoHospital> = [
  {
    name: 'Hospital Esperança',
    slug: 'hospital-esperanca',
    accountEmail: 'hospital.esperanca@example.com',
    sectors: [
      { name: 'UTI Adulto', beds: 4 },
      { name: 'Enfermaria Clínica', beds: 4 },
      { name: 'Pronto-Socorro', beds: 3 },
    ],
    requests: [
      {
        sector: 'UTI Adulto',
        bed: 'Leito 02',
        medication: 'Noradrenalina',
        quantity: 2,
        dose: '4 mg/4 ml',
        route: 'Intravenosa',
        urgency: 'urgente',
        status: 'solicitado',
        minutesAgo: 6,
        deadlineInMinutes: 15,
        notes: 'Paciente instável, prioridade máxima.',
      },
      {
        sector: 'Pronto-Socorro',
        bed: 'Leito 01',
        medication: 'Dipirona',
        quantity: 1,
        dose: '1 g',
        route: 'Intravenosa',
        urgency: 'urgente',
        status: 'em_separacao',
        minutesAgo: 14,
      },
      {
        sector: 'Enfermaria Clínica',
        bed: 'Leito 03',
        medication: 'Ceftriaxona',
        quantity: 1,
        dose: '1 g',
        route: 'Intravenosa',
        urgency: 'prioritario',
        status: 'solicitado',
        minutesAgo: 22,
        deadlineInMinutes: 90,
      },
      {
        sector: 'UTI Adulto',
        bed: 'Leito 01',
        medication: 'Enoxaparina',
        quantity: 1,
        dose: '40 mg',
        route: 'Subcutânea',
        urgency: 'prioritario',
        status: 'enviado',
        minutesAgo: 35,
        deadlineInMinutes: 40,
      },
      {
        sector: 'Enfermaria Clínica',
        bed: 'Leito 01',
        medication: 'Omeprazol',
        quantity: 1,
        dose: '40 mg',
        route: 'Oral',
        urgency: 'rotina',
        status: 'solicitado',
        minutesAgo: 41,
        notes: 'Administrar em jejum.',
      },
      {
        // Newer than Omeprazol but has a deadline, so it comes first within "Rotina".
        sector: 'Enfermaria Clínica',
        bed: 'Leito 02',
        medication: 'Losartana',
        quantity: 1,
        dose: '50 mg',
        route: 'Oral',
        urgency: 'rotina',
        status: 'solicitado',
        minutesAgo: 5,
        deadlineInMinutes: 60 * 3,
      },
      {
        sector: 'Enfermaria Clínica',
        bed: 'Leito 04',
        medication: 'Paracetamol',
        quantity: 2,
        dose: '750 mg',
        route: 'Oral',
        urgency: 'rotina',
        status: 'recebido',
        minutesAgo: 90,
      },
      {
        sector: 'Pronto-Socorro',
        bed: 'Leito 03',
        medication: 'Amoxicilina',
        quantity: 1,
        dose: '5 g',
        route: 'Oral',
        urgency: 'rotina',
        status: 'recusado',
        minutesAgo: 75,
        refusalReason: 'Dose fora do padrão',
      },
    ],
  },
  {
    name: 'Hospital São Lucas',
    slug: 'hospital-sao-lucas',
    accountEmail: 'hospital.saolucas@example.com',
    sectors: [
      { name: 'UTI Pediátrica', beds: 3 },
      { name: 'Enfermaria Cirúrgica', beds: 4 },
      { name: 'Maternidade', beds: 3 },
    ],
    requests: [
      {
        sector: 'UTI Pediátrica',
        bed: 'Leito 02',
        medication: 'Salbutamol',
        quantity: 1,
        dose: '100 mcg/jato',
        route: 'Inalatória',
        urgency: 'urgente',
        status: 'solicitado',
        minutesAgo: 9,
        deadlineInMinutes: 10,
      },
      {
        sector: 'Enfermaria Cirúrgica',
        bed: 'Leito 01',
        medication: 'Ondansetrona',
        quantity: 1,
        dose: '8 mg',
        route: 'Intravenosa',
        urgency: 'prioritario',
        status: 'em_separacao',
        minutesAgo: 18,
      },
      {
        sector: 'Maternidade',
        bed: 'Leito 03',
        medication: 'Sulfato ferroso',
        quantity: 30,
        dose: '40 mg',
        route: 'Oral',
        urgency: 'rotina',
        status: 'solicitado',
        minutesAgo: 50,
      },
    ],
  },
];

function bedLabel(index: number) {
  return `Leito ${String(index + 1).padStart(2, '0')}`;
}

/** Deletes a hospital's requests, beds and sectors so the demo data can be rebuilt. */
async function clearHospitalStructure(ctx: MutationCtx, organizationId: string) {
  for await (const request of ctx.db
    .query('medicationRequests')
    .withIndex('by_org_and_urgencyRank', (q) => q.eq('organizationId', organizationId))) {
    await ctx.db.delete(request._id);
  }
  for await (const bed of ctx.db
    .query('beds')
    .withIndex('by_org_and_sector_and_sortOrder', (q) => q.eq('organizationId', organizationId))) {
    await ctx.db.delete(bed._id);
  }
  for await (const sector of ctx.db
    .query('sectors')
    .withIndex('by_org_and_sortOrder', (q) => q.eq('organizationId', organizationId))) {
    await ctx.db.delete(sector._id);
  }
}

async function seedHospitalStructure(
  ctx: MutationCtx,
  organizationId: string,
  hospital: DemoHospital,
  accountUserId: Id<'users'>
) {
  const existing = await ctx.db
    .query('sectors')
    .withIndex('by_org_and_sortOrder', (q) => q.eq('organizationId', organizationId))
    .first();
  if (existing) {
    return false;
  }

  const bedIds = new Map<string, { sectorId: Id<'sectors'>; bedId: Id<'beds'> }>();
  for (const [sectorIndex, sector] of hospital.sectors.entries()) {
    const sectorId = await ctx.db.insert('sectors', {
      organizationId,
      name: sector.name,
      sortOrder: sectorIndex,
    });
    for (let bedIndex = 0; bedIndex < sector.beds; bedIndex += 1) {
      const label = bedLabel(bedIndex);
      const bedId = await ctx.db.insert('beds', {
        organizationId,
        sectorId,
        label,
        sortOrder: bedIndex,
      });
      bedIds.set(`${sector.name}|${label}`, { sectorId, bedId });
    }
  }

  const now = Date.now();
  // Number requests in the order they were made: the oldest is "Solicitação 1".
  const byAge = hospital.requests.toSorted((left, right) => right.minutesAgo - left.minutesAgo);
  for (const [index, request] of byAge.entries()) {
    const location = bedIds.get(`${request.sector}|${request.bed}`);
    if (!location) {
      throw new Error(`Leito de exemplo inexistente: ${request.sector} · ${request.bed}`);
    }
    const createdAt = now - request.minutesAgo * 60_000;
    const step = 5 * 60_000;
    const reached = (status: RequestStatus) => {
      const order: ReadonlyArray<RequestStatus> = ['em_separacao', 'enviado', 'recebido'];
      return (
        request.status !== 'recusado' && order.indexOf(request.status) >= order.indexOf(status)
      );
    };
    const details = DEMO_DETAILS[request.medication] ?? { form: 'Comprimido', dose: '1 unidade' };
    await ctx.db.insert('medicationRequests', {
      organizationId,
      number: index + 1,
      sectorId: location.sectorId,
      bedId: location.bedId,
      medication: request.medication,
      concentration: request.dose,
      pharmaceuticalForm: details.form,
      quantity: request.quantity,
      dose: details.dose,
      acceptedByDevice: reached('em_separacao') ? OTHER_PHARMACY_DEVICE : undefined,
      route: request.route,
      urgency: request.urgency,
      urgencyRank: URGENCY_RANK[request.urgency],
      notes: request.notes,
      deadline:
        request.deadlineInMinutes === undefined
          ? undefined
          : now + request.deadlineInMinutes * 60_000,
      status: request.status,
      refusalReason: request.refusalReason,
      createdBy: accountUserId,
      createdAt,
      updatedAt: createdAt + step,
      separationStartedAt: reached('em_separacao') ? createdAt + step : undefined,
      sentAt: reached('enviado') ? createdAt + 2 * step : undefined,
      receivedAt: reached('recebido') ? createdAt + 3 * step : undefined,
      refusedAt: request.status === 'recusado' ? createdAt + step : undefined,
    });
  }
  return true;
}

/**
 * `npx convex run demo:seedHospitals "{}"` adds the demo hospitals if missing.
 * `npx convex run demo:seedHospitals "{\"reset\":true}"` wipes their sectors, beds and requests
 * first, to start a pitch rehearsal from the original demo data.
 */
export const seedHospitals = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  returns: v.array(
    v.object({ hospital: v.string(), accountEmail: v.string(), seededData: v.boolean() })
  ),
  handler: async (ctx, { reset }) => {
    const { user: platformUser } = await ensureUserByEmail(
      ctx,
      PLATFORM_ADMIN_EMAIL,
      'Platform Admin'
    );

    const result = [];
    for (const hospital of DEMO_HOSPITALS) {
      const { user: account } = await ensureUserByEmail(ctx, hospital.accountEmail, hospital.name);
      const organizationId = await ensureOrganization(
        ctx,
        platformUser._id,
        hospital.name,
        hospital.slug
      );
      await seedOrgMember(ctx, platformUser._id, organizationId, account._id, 'admin');
      if (reset) {
        await clearHospitalStructure(ctx, organizationId);
      }
      const seededData = await seedHospitalStructure(ctx, organizationId, hospital, account._id);
      result.push({ hospital: hospital.name, accountEmail: hospital.accountEmail, seededData });
    }
    return result;
  },
});
