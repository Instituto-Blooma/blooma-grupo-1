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
  }).index('by_org_and_sortOrder', ['organizationId', 'sortOrder']),

  // Beds belong to one sector of one hospital, e.g. "Leito 03".
  beds: defineTable({
    organizationId: v.string(),
    sectorId: v.id('sectors'),
    label: v.string(),
    sortOrder: v.number(),
  }).index('by_org_and_sector_and_sortOrder', ['organizationId', 'sectorId', 'sortOrder']),

  medicationRequests: defineTable({
    organizationId: v.string(),
    sectorId: v.id('sectors'),
    bedId: v.id('beds'),
    medication: v.string(),
    quantity: v.number(),
    dose: v.string(),
    route: v.string(),
    urgency: v.union(v.literal('urgente'), v.literal('prioritario'), v.literal('rotina')),
    // 0 = urgente, 1 = prioritario, 2 = rotina; drives the pharmacy queue order.
    urgencyRank: v.number(),
    notes: v.optional(v.string()),
    status: v.union(
      v.literal('solicitado'),
      v.literal('em_separacao'),
      v.literal('enviado'),
      v.literal('recebido'),
      v.literal('recusado')
    ),
    refusalReason: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
    separationStartedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    receivedAt: v.optional(v.number()),
    refusedAt: v.optional(v.number()),
  })
    .index('by_org_and_urgencyRank', ['organizationId', 'urgencyRank'])
    .index('by_org_and_bed', ['organizationId', 'bedId']),
});

export default schema;
