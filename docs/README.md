# Documentation

Guides for forked B2B startups using this template. Domain vocabulary in [AGENTS.md](../AGENTS.md); hard-to-reverse decisions in [adr/](./adr/).

## Guides

| Guide                                              | Audience               | Contents                                                               |
| -------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| [architecture.md](./architecture.md)               | Developers, AI agents  | Backend modules, routes, auth and permission model                     |
| [frontend.md](./frontend.md)                       | Developers, AI agents  | shadcn/ui, forms, toast, UI conventions for this template              |
| [onboarding.md](./onboarding.md)                   | Product, developers    | Provisioning, invitations, OAuth gates, lifecycle states               |
| [environment.md](./environment.md)                 | Ops, developers        | Convex and Vite env vars, emulators, production                        |
| [customization.md](./customization.md)             | Fork owners            | Checklist after remixing the template                                  |
| [updating-downstream.md](./updating-downstream.md) | Fork owners, AI agents | Port template changes into downstream apps; `.convexplate-last-commit` |
| [testing.md](./testing.md)                         | Everyone               | Do not add unit, Cypress, or end-to-end tests                          |

## For AI assistants

- [AGENTS.md](../AGENTS.md) — orientation and agent-skill wiring
- [frontend.md](./frontend.md) — shadcn/ui, forms, and UI conventions (bridge for the shadcn skill)
- [updating-downstream.md](./updating-downstream.md) — port template changes; skill: [update-downstream](../.agents/skills/update-downstream/SKILL.md)
- [agents/audience.md](./agents/audience.md) — who the builders are and how to ask them questions
- [agents/domain.md](./agents/domain.md) — how to read AGENTS.md vocabulary and ADRs
- [agents/issue-tracker.md](./agents/issue-tracker.md) — GitHub Issues conventions
- [agents/triage-labels.md](./agents/triage-labels.md) — triage label vocabulary

## Architectural decisions

| ADR                                                                                         | Topic                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [0001 B2B tenancy and platform admin](./adr/0001-b2b-tenancy-and-platform-admin.md)         | Organizations, onboarding, authz, impersonation, email  |
| [0002 Yjs collab and org-scoped presence](./adr/0002-yjs-collab-and-org-scoped-presence.md) | RichText collab, markdown snapshots, DataTable presence |
| [0003 PR preview public Convex HTTP](./adr/0003-pr-preview-public-convex-http.md)           | Local Convex on `/_convex` and `/_convex_site`          |

## Also see

- [SETUP.md](../SETUP.md) — first-run local and Railway setup
- [convex/README.md](../convex/README.md) — where to add Convex functions
