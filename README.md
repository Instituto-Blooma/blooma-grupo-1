# Hackblooma

Instituto Blooma product on the **convexplate** B2B foundation: **Organizations** with isolated data, **provisioned onboarding** (invite before sign-in), **org-scoped authorization**, and **Platform Admin** tooling.

Built on Vite, React, TypeScript, and Convex — with local dev, GitHub CI, and Railway deploy.

## What You Get

- **Organizations** (multi-company isolation) via `@djpanda/convex-tenants`
- **Authorization** via `@djpanda/convex-authz` (org permissions + platform admin role)
- **Provisioning and invitations** (Resend; emulated locally)
- Google OAuth (emulated in dev; real provider in production)
- Reference org-scoped feature: todos with ABAC pattern
- Platform admin UI at `/admin`; org settings at `/settings/*`
- Agent skills in `.agents/skills/` (Claude Code: `.claude/skills/`)
- Demo mode before Convex is configured; Tailwind + shadcn/ui; lint/format/typecheck

## Quick Start (Local)

```bash
pnpm install
pnpm run setup
pnpm run dev:all
```

`dev:all` starts Google OAuth emulate (`:4002`), Resend emulate (`:4003`), local Convex, and Vite on `:5173`.

Sign in with a first-setup emulator user — **Dev User**, **Test User**, or `platform@example.com`. You land in **Acme Corp**.

Detailed walkthrough: [SETUP.md](./SETUP.md).

## Scripts

| Script                           | Description                                           |
| -------------------------------- | ----------------------------------------------------- |
| `pnpm run setup`                 | One-time local Convex + auth + emulator env           |
| `pnpm run dev:all`               | Full dev stack (emulators, Convex, Vite)              |
| `pnpm run dev:backend`           | Convex dev (force-upgrade local backend)              |
| `pnpm run prefetch:convex:local` | Cache Convex local backend for Railway/CI             |
| `pnpm run dev`                   | Vite only                                             |
| `pnpm run build`                 | Convex codegen + production frontend build            |
| `pnpm run deploy:convex`         | Deploy Convex functions (Railway pre-deploy)          |
| `pnpm run check`                 | Format, lint, and typecheck                           |

## Deploy (Railway)

- **Production**: `pnpm run build` → `pnpm run deploy:convex` → static serve via `node script/run.mjs railway serve`
- **PR previews**: Railway `local` / `pr` environments run the full local-Convex dev stack

See [railway.toml](./railway.toml) and [docs/environment.md](./docs/environment.md).

## Docs

- [SETUP.md](./SETUP.md) — first-run setup
- [docs/architecture.md](./docs/architecture.md) — tenancy, authz, onboarding
- [docs/updating-downstream.md](./docs/updating-downstream.md) — port template changes into forks
- [docs/testing.md](./docs/testing.md) — why tests are not advised
- [docs/environment.md](./docs/environment.md) — env vars and Railway
