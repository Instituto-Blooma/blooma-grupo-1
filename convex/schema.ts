import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

const schema = defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.float64()),
    isAnonymous: v.optional(v.boolean()),
    onboardingStatus: v.optional(
      v.union(v.literal('pending'), v.literal('invited'), v.literal('active'))
    ),
    invitedAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  impersonationSessions: defineTable({
    adminUserId: v.id('users'),
    targetUserId: v.id('users'),
    startedAt: v.number(),
    expiresAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index('by_admin', ['adminUserId']),

  todos: defineTable({
    organizationId: v.string(),
    userId: v.id('users'),
    createdBy: v.id('users'),
    title: v.string(),
    description: v.optional(v.string()),
    completed: v.boolean(),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    dueDate: v.optional(v.float64()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_and_user', ['organizationId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_user_and_completed', ['userId', 'completed'])
    .index('by_user_and_priority', ['userId', 'priority']),

  collabMarkdown: defineTable({
    organizationId: v.string(),
    documentId: v.string(),
    markdown: v.string(),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
  })
    .index('by_documentId', ['documentId'])
    .index('by_org_and_document', ['organizationId', 'documentId']),

  // Hospital (organization) sectors, e.g. "UTI", "Enfermaria".
  sectors: defineTable({
    organizationId: v.string(),
    name: v.string(),
    sortOrder: v.number(),
    // false = desativado (kept because requests reference it); missing = active.
    active: v.optional(v.boolean()),
  }).index('by_org_and_sortOrder', ['organizationId', 'sortOrder']),

  // Beds belong to one sector of one hospital, e.g. "Leito 03".
  beds: defineTable({
    organizationId: v.string(),
    sectorId: v.id('sectors'),
    label: v.string(),
    sortOrder: v.number(),
    // false = desativado (kept because requests reference it); missing = active.
    active: v.optional(v.boolean()),
  }).index('by_org_and_sector_and_sortOrder', ['organizationId', 'sectorId', 'sortOrder']),

  medicationRequests: defineTable({
    organizationId: v.string(),
    // Fixed per-hospital number shown as "Solicitação 12". Optional only so requests created
    // before numbering existed still load; `pnpm run demo:reset` renumbers demo data.
    number: v.optional(v.number()),
    // A prescription ("Solicitação N") can hold several medications: every item shares the
    // number, sector and bed, and has its own position (1..itemCount), details and status.
    itemIndex: v.optional(v.number()),
    itemCount: v.optional(v.number()),
    // Who made the request (identification field on the form).
    requesterName: v.optional(v.string()),
    // Hospital identification number of the professional (was the COREN; name kept so older
    // requests still load). Same for acceptedByCrf and prescriberCrm below.
    requesterCoren: v.optional(v.string()),
    sectorId: v.id('sectors'),
    bedId: v.id('beds'),
    medication: v.string(),
    // Strength, e.g. "500 mg/ml".
    concentration: v.optional(v.string()),
    // Pharmaceutical form, e.g. "Comprimido", "Injetável".
    pharmaceuticalForm: v.optional(v.string()),
    quantity: v.number(),
    // Amount the patient receives, e.g. "2 ml", "1 comprimido".
    dose: v.string(),
    route: v.string(),
    urgency: v.union(v.literal('urgente'), v.literal('prioritario'), v.literal('rotina')),
    // 0 = urgente, 1 = prioritario, 2 = rotina; drives the pharmacy queue order.
    urgencyRank: v.number(),
    notes: v.optional(v.string()),
    // Controlled medication (Portaria 344): list it belongs to ("B1", "C1"...) and the
    // prescription data nursing must fill in before the request is accepted.
    controlledList: v.optional(v.string()),
    prescriptionNumber: v.optional(v.string()),
    prescriberName: v.optional(v.string()),
    prescriberCrm: v.optional(v.string()),
    // Optional "data e horário limite" set by nursing (ms since epoch).
    deadline: v.optional(v.number()),
    status: v.union(
      v.literal('solicitado'),
      v.literal('em_separacao'),
      v.literal('enviado'),
      v.literal('recebido'),
      v.literal('recusado')
    ),
    refusalReason: v.optional(v.string()),
    // When nursing clicked "Ciente" on a rejected request; until then it stays in
    // "Acompanhar entregas" so the rejection is not missed.
    refusalAcknowledgedAt: v.optional(v.number()),
    // Device (browser) that accepted the request; only it can mark it as sent. Other devices
    // see the request as "Solicitação em andamento".
    acceptedByDevice: v.optional(v.string()),
    // Pharmacy professional who accepted it (asked when tapping "Aceitar").
    acceptedByName: v.optional(v.string()),
    // Marked by the pharmacy when sending: nursing must keep it in the refrigerator.
    refrigerated: v.optional(v.boolean()),
    // Delivery problems reported by nursing ("Reportar erro na entrega"). Each one sends the
    // medication back to the top of the pharmacy queue (needsRedelivery) and stays in the history.
    needsRedelivery: v.optional(v.boolean()),
    deliveryErrors: v.optional(
      v.array(
        v.object({
          reason: v.string(),
          reportedAt: v.number(),
          // The delivery that went wrong, so the history keeps it after the medication restarts.
          sentAt: v.optional(v.number()),
          acceptedByName: v.optional(v.string()),
        })
      )
    ),
    acceptedByCrf: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    separationStartedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    receivedAt: v.optional(v.number()),
    refusedAt: v.optional(v.number()),
  })
    .index('by_org_and_urgencyRank', ['organizationId', 'urgencyRank'])
    .index('by_org_and_bed', ['organizationId', 'bedId'])
    .index('by_org_and_number', ['organizationId', 'number']),
});

export default schema;
