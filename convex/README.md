# Convex backend

Business logic for the B2B template. Domain vocabulary: [AGENTS.md](../AGENTS.md). Architecture: [docs/architecture.md](../docs/architecture.md).

## Where to put code

| Area              | Files           | Use for                                          |
| ----------------- | --------------- | ------------------------------------------------ |
| Shared helpers    | `convex/lib/*`  | Auth, onboarding, users, invitations, succession |
| User lifecycle    | `onboarding.ts` | Provision, invite, activate, deprovision         |
| Platform ops      | `platform.ts`   | Organizations, impersonation                     |
| Tenancy API       | `tenants.ts`    | Organization membership and invitations          |
| Permissions       | `authz.ts`      | Role and permission definitions                  |
| Reference feature | `todos.ts`      | Org-scoped queries/mutations with authz + ABAC   |
| Email             | `emails.ts`     | Resend send                                      |
| Schema            | `schema.ts`     | Tables and indexes                               |

## Rules for new org-scoped tables

1. Add `organizationId` to every org-scoped document.
2. Index for org-scoped queries (`by_org`, etc.).
3. Enforce permissions in **every** public query and mutation — never trust the client.
4. Use `authz.withTenant(organizationId)` — see `todos.ts` and [ADR 0001](../docs/adr/0001-b2b-tenancy-and-platform-admin.md).
5. If resources track `createdBy`, wire **Succession** on member departure (`lib/succession.ts`).

## Auth

- `auth.ts` — Convex Auth; blocks OAuth until User is invited; activates onboarding on sign-in
- `lib/auth.ts` — Platform Admin allowlist and role checks

## Local seed

- `testing/e2e.ts` — seeds local development users during setup. Not a test suite, and not for production. Do not add tests beside it. See [docs/testing.md](../docs/testing.md).

## Convex CLI

```bash
npx convex dev          # watch mode
npx convex env set KEY value
npx convex docs
```

Parent setup: [SETUP.md](../SETUP.md). Environment variables: [docs/environment.md](../docs/environment.md).
