import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getHospitalAccess, requireHospitalSettingsAccess } from './lib/hospitalAccess';

/**
 * "Setores e leitos" settings: each hospital builds its own structure. Beds are numbered
 * automatically ("Leito 01", "Leito 02"...). A sector or bed that already has medication
 * requests is never deleted, only deactivated, so Histórico keeps showing where each request went.
 */

export const MAX_SECTORS = 50;
export const MAX_BEDS_PER_SECTOR = 100;
const MAX_NAME_LENGTH = 60;

function bedLabel(index: number) {
  return `Leito ${String(index + 1).padStart(2, '0')}`;
}

export function isActive(doc: { active?: boolean }) {
  return doc.active !== false;
}

async function sectorsOf(ctx: QueryCtx | MutationCtx, organizationId: string) {
  return await ctx.db
    .query('sectors')
    .withIndex('by_org_and_sortOrder', (q) => q.eq('organizationId', organizationId))
    .take(MAX_SECTORS * 2);
}

async function bedsOf(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  sectorId: Id<'sectors'>
) {
  return await ctx.db
    .query('beds')
    .withIndex('by_org_and_sector_and_sortOrder', (q) =>
      q.eq('organizationId', organizationId).eq('sectorId', sectorId)
    )
    .take(MAX_BEDS_PER_SECTOR * 2);
}

async function bedHasRequests(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  bedId: Id<'beds'>
) {
  const request = await ctx.db
    .query('medicationRequests')
    .withIndex('by_org_and_bed', (q) => q.eq('organizationId', organizationId).eq('bedId', bedId))
    .first();
  return request !== null;
}

function cleanName(name: string) {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    throw new Error('Informe o nome do setor');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`O nome do setor pode ter até ${MAX_NAME_LENGTH} caracteres`);
  }
  return trimmed;
}

function checkBedCount(bedCount: number) {
  if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > MAX_BEDS_PER_SECTOR) {
    throw new Error(
      `A quantidade de leitos deve ser um número inteiro de 1 a ${MAX_BEDS_PER_SECTOR}`
    );
  }
}

async function requireUniqueName(
  ctx: MutationCtx,
  organizationId: string,
  name: string,
  exceptId?: Id<'sectors'>
) {
  const taken = (await sectorsOf(ctx, organizationId)).some(
    (sector) =>
      sector._id !== exceptId &&
      isActive(sector) &&
      sector.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')
  );
  if (taken) {
    throw new Error(`Já existe um setor chamado "${name}"`);
  }
}

async function loadSector(ctx: MutationCtx, organizationId: string, sectorId: Id<'sectors'>) {
  const sector = await ctx.db.get(sectorId);
  if (!sector || sector.organizationId !== organizationId) {
    throw new Error('Setor não encontrado neste hospital');
  }
  return sector;
}

/**
 * Makes the sector have exactly `bedCount` active beds, numbered from Leito 01. Extra beds are
 * deleted when they were never used, or deactivated when they already have requests.
 */
async function applyBedCount(ctx: MutationCtx, sector: Doc<'sectors'>, bedCount: number) {
  const beds = (await bedsOf(ctx, sector.organizationId, sector._id)).toSorted(
    (left, right) => left.sortOrder - right.sortOrder
  );
  for (let index = 0; index < Math.max(bedCount, beds.length); index += 1) {
    const bed = beds[index];
    if (index < bedCount) {
      if (!bed) {
        await ctx.db.insert('beds', {
          organizationId: sector.organizationId,
          sectorId: sector._id,
          label: bedLabel(index),
          sortOrder: index,
        });
      } else if (!isActive(bed)) {
        await ctx.db.patch('beds', bed._id, { active: true });
      }
      continue;
    }
    if (!bed || !isActive(bed)) {
      continue;
    }
    if (await bedHasRequests(ctx, sector.organizationId, bed._id)) {
      await ctx.db.patch('beds', bed._id, { active: false });
    } else {
      await ctx.db.delete('beds', bed._id);
    }
  }
}

/** Everything the settings screen needs, including deactivated sectors. */
export const listStructure = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => {
    if (!(await getHospitalAccess(ctx, organizationId))) {
      return [];
    }
    const sectors = await sectorsOf(ctx, organizationId);
    return await Promise.all(
      sectors.map(async (sector) => {
        const beds = (await bedsOf(ctx, organizationId, sector._id)).toSorted(
          (left, right) => left.sortOrder - right.sortOrder
        );
        const activeBeds = beds.filter(isActive);
        let hasRequests = false;
        for (const bed of beds) {
          if (await bedHasRequests(ctx, organizationId, bed._id)) {
            hasRequests = true;
            break;
          }
        }
        return {
          _id: sector._id,
          name: sector.name,
          active: isActive(sector),
          bedCount: activeBeds.length,
          bedLabels: activeBeds.map((bed) => bed.label),
          hasRequests,
        };
      })
    );
  },
});

export const createSector = mutation({
  args: { organizationId: v.string(), name: v.string(), bedCount: v.number() },
  handler: async (ctx, { organizationId, name, bedCount }) => {
    await requireHospitalSettingsAccess(ctx, organizationId);
    const cleaned = cleanName(name);
    checkBedCount(bedCount);
    await requireUniqueName(ctx, organizationId, cleaned);
    const sectors = await sectorsOf(ctx, organizationId);
    if (sectors.filter(isActive).length >= MAX_SECTORS) {
      throw new Error(`Um hospital pode ter até ${MAX_SECTORS} setores ativos`);
    }
    const sortOrder = sectors.reduce((max, sector) => Math.max(max, sector.sortOrder), -1) + 1;
    const sectorId = await ctx.db.insert('sectors', { organizationId, name: cleaned, sortOrder });
    const sector = await ctx.db.get(sectorId);
    if (sector) {
      await applyBedCount(ctx, sector, bedCount);
    }
    return sectorId;
  },
});

export const renameSector = mutation({
  args: { organizationId: v.string(), sectorId: v.id('sectors'), name: v.string() },
  handler: async (ctx, { organizationId, sectorId, name }) => {
    await requireHospitalSettingsAccess(ctx, organizationId);
    await loadSector(ctx, organizationId, sectorId);
    const cleaned = cleanName(name);
    await requireUniqueName(ctx, organizationId, cleaned, sectorId);
    await ctx.db.patch('sectors', sectorId, { name: cleaned });
    return null;
  },
});

export const setBedCount = mutation({
  args: { organizationId: v.string(), sectorId: v.id('sectors'), bedCount: v.number() },
  handler: async (ctx, { organizationId, sectorId, bedCount }) => {
    await requireHospitalSettingsAccess(ctx, organizationId);
    checkBedCount(bedCount);
    const sector = await loadSector(ctx, organizationId, sectorId);
    if (!isActive(sector)) {
      throw new Error('Reative o setor antes de mudar os leitos');
    }
    await applyBedCount(ctx, sector, bedCount);
    return null;
  },
});

/** Deletes a never-used sector; deactivates one that already has requests. */
export const removeSector = mutation({
  args: { organizationId: v.string(), sectorId: v.id('sectors') },
  handler: async (ctx, { organizationId, sectorId }) => {
    await requireHospitalSettingsAccess(ctx, organizationId);
    const sector = await loadSector(ctx, organizationId, sectorId);
    const beds = await bedsOf(ctx, organizationId, sectorId);
    let used = false;
    for (const bed of beds) {
      if (await bedHasRequests(ctx, organizationId, bed._id)) {
        used = true;
        break;
      }
    }
    if (used) {
      for (const bed of beds) {
        if (isActive(bed)) {
          await ctx.db.patch('beds', bed._id, { active: false });
        }
      }
      await ctx.db.patch('sectors', sector._id, { active: false });
      return { result: 'desativado' as const };
    }
    for (const bed of beds) {
      await ctx.db.delete('beds', bed._id);
    }
    await ctx.db.delete('sectors', sector._id);
    return { result: 'excluido' as const };
  },
});

export const reactivateSector = mutation({
  args: { organizationId: v.string(), sectorId: v.id('sectors'), bedCount: v.number() },
  handler: async (ctx, { organizationId, sectorId, bedCount }) => {
    await requireHospitalSettingsAccess(ctx, organizationId);
    checkBedCount(bedCount);
    const sector = await loadSector(ctx, organizationId, sectorId);
    await requireUniqueName(ctx, organizationId, sector.name, sectorId);
    await ctx.db.patch('sectors', sectorId, { active: true });
    await applyBedCount(ctx, { ...sector, active: true }, bedCount);
    return null;
  },
});
