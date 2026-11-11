# ADR 0001: B2B Tenancy and Platform Admin

## Status

Accepted

## Context

This template serves B2B customers where each company is an isolated Organization. Users authenticate with Google OAuth via Convex Auth, but authorization and organization membership are managed separately through `@djpanda/convex-authz` and `@djpanda/convex-tenants`.

## Decisions

### Organization model

- **Organization = Company** — the primary data-isolation boundary.
- **Single-org users** — regular users belong to at most one organization.
- **Org roles** — `admin` and `member` only. There is no org-level `owner` role.
- **Structural owner** — the platform admin who creates an organization is stored as `ownerId`; delegated company admins hold the `admin` role.

### Platform admins

- Platform admins are outside the org membership model.
- Bootstrap via email allowlist (`PLATFORM_ADMIN_EMAILS`) plus global `platform_admin` authz role.
- Platform admins can create organizations, provision users across orgs, move users between orgs, and impersonate users.

### Onboarding flow

1. **Provision** — admin creates User record + org Membership; User `onboardingStatus` → `pending`.
2. **Invite** — invitation email sent via Resend (emulated locally on `:4003`); status → `invited`.
3. **Activate** — invited User signs in with Google; email match → `active`.

OAuth is blocked until an invite is sent. Unprovisioned emails are rejected at sign-in. Product flows: [onboarding.md](../onboarding.md). Vocabulary: [AGENTS.md](../../AGENTS.md).

### Invitation policy

- Org admins always send invites immediately when provisioning.
- Platform admins may defer invites via optional "Send Invite" checkbox.
- Invitation TTL: **7 days**.

### Data succession

When any member leaves an organization (remove, move, deprovision), all org-scoped resources with `createdBy = departingUser` are reassigned to a chosen successor.

### Authorization

- Org-scoped resources use permission checks via `authz.withTenant(organizationId)`.
- Members may update their own resources (ABAC) even when they lack broad admin permissions.
- Example reference implementation: `convex/todos.ts`.

### Impersonation

- Token-swap impersonation for platform admins.
- Start/stop actions are audited in `impersonationSessions`.
- UI shows an impersonation banner while active.

### Email

- Production: Resend SDK.
- Dev/test: emulate Resend via `RESEND_BASE_URL` (port `:4003`), same code path as production.

## Consequences

- All new org-scoped tables must include `organizationId` and enforce authz checks server-side.
- Organization isolation is enforced in every org-scoped query and mutation.
- Platform admin workflows live on `/admin`; org admin workflows live under `/settings/*`.

## See also

- [Architecture](../architecture.md) — module map and routes
- [Environment](../environment.md) — Convex and Vite variables
- [Customization](../customization.md) — fork checklist
- [Testing](../testing.md) — tests are not advised in this repository
