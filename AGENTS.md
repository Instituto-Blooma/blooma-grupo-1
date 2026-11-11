# Agent orientation

**Hackblooma** — Instituto Blooma product built on the **convexplate** B2B foundation (Organizations, provisioned onboarding, org-scoped authorization, and Platform Admin tooling).

## Who you are talking to

The main developers on this project are **high-performing high school girls**. They are sharp and own product decisions. They do **not** have a software-engineering background.

When you ask them anything — especially `/grill-with-docs` and `/grill-me`:

1. Ask about the product, people, and how the program should work. Never ask how to build it.
2. Do the technical work yourself. Do not ask them to choose databases, APIs, schemas, auth mechanics, or similar.
3. Use everyday language. Avoid jargon, or explain a term in one short phrase if you must use it.
4. Every question is **one question** with **exactly 3 reply options** (A / B / C), plus your recommended pick.

Full interviewer rules: [docs/agents/audience.md](./docs/agents/audience.md).

## First setup on a new machine

### Tools this computer needs

Check `node`, `npm`, `pnpm`, and `git` before anything else. Same commands on Windows, macOS, and Linux. If any are missing, install them yourself — do not ask the builders.

| Tool     | Version this repo expects                            | How to check    |
| -------- | ---------------------------------------------------- | --------------- |
| **git**  | any recent                                           | `git --version` |
| **Node** | **22.22** (`.nvmrc`; `package.json` wants `22.22.2`) | `node -v`       |
| **npm**  | comes with Node                                      | `npm -v`        |
| **pnpm** | **11.1.1** (`packageManager` in `package.json`)      | `pnpm -v`       |

If a tool is missing, install it for this OS, then open a **new** terminal so `PATH` updates.

1. **git** — [Git for Windows](https://git-scm.com/download/win), [macOS](https://git-scm.com/download/mac), or [Linux](https://git-scm.com/download/linux). Package managers are fine (`winget install Git.Git`, `brew install git`, `sudo apt install git`).
2. **Node 22** (npm arrives with it):
   - Official installer (any OS): [nodejs.org](https://nodejs.org) — pick the **22.x LTS** (or Current 22.22.x) build.
   - Version managers: `fnm` (Windows / macOS / Linux) or `nvm` (macOS / Linux) — `fnm install` / `nvm install` reads `.nvmrc`. On Windows, `nvm-windows` works; it does not read `.nvmrc` automatically, so install **22.22**.
3. **pnpm** (same on every OS, after Node is on `PATH`):

   ```bash
   corepack enable
   corepack prepare pnpm@11.1.1 --activate
   ```

   On Windows, run that in **PowerShell or Git Bash** (not Command Prompt). If `corepack` is blocked, open the terminal as administrator, or `npm install -g pnpm@11.1.1`.

4. Confirm `node -v` is 22.x and `pnpm -v` is 11.x.

Windows notes: prefer PowerShell or Git Bash for all later commands. WSL2 is optional — only use it if the person already works there; then install the same tools _inside_ WSL, not only on Windows.

Then clone the repo if it is not already on disk.

### First run (once)

A fresh clone (or a computer that has never run this app) needs Convex installed **before** env can be written. Do this once:

1. `pnpm install` if `node_modules` is missing.
2. `pnpm run dev:all` — this downloads and starts the local Convex backend. Leave it until Convex is up, then stop it.
3. `pnpm run setup` — this writes `.env.local` and Convex env (auth keys, seed users, emulate URLs).
4. `pnpm run dev:all` again — the app now has env and is ready. Open `http://localhost:5173`.

Every later session is just `pnpm run dev:all`. Do not rerun `setup` unless `.env.local` is missing or sign-in is broken.

See [SETUP.md](./SETUP.md) for the full environment matrix and troubleshooting.

## First tasks on a new fork

1. Finish [First setup on a new machine](#first-setup-on-a-new-machine).
2. Run `/grill-with-docs` to replace example terms (Acme, example.com emails) with your product language and create a domain glossary if needed. Follow [docs/agents/audience.md](./docs/agents/audience.md) for every question.
3. Follow [docs/customization.md](./docs/customization.md) for production env and demo cleanup.

## Domain vocabulary

Use these terms in issue titles, plans, and user-facing copy. Do not introduce synonyms the template avoids.

| Term                     | Meaning                                                                          | Avoid                                        |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| **Organization**         | B2B customer company — primary data-isolation boundary                           | tenant, workspace, account (for the company) |
| **User**                 | Person identified by email at provisioning; linked to Google OAuth at activation | member (when meaning the person)             |
| **Provisioning**         | Creating a User + org Membership before first sign-in                            | invite (as the provisioning act)             |
| **Activation**           | User completes onboarding — accepts Invitation, signs in, gains access           | sign-up, registration                        |
| **Invitation**           | Email with link to accept membership; distinct from onboarding lifecycle         | invite (as noun for the User record)         |
| **Onboarding lifecycle** | `pending` → `invited` → `active`                                                 | account status, user state                   |
| **Member**               | User's membership in an Organization with a role                                 | user (when meaning the relationship)         |
| **Platform Admin**       | Startup operator with cross-org access via allowlist + global authz role         | superadmin, god user                         |

Read [docs/adr/](./docs/adr/) before changing tenancy, onboarding, or platform admin behavior.

## Documentation map

| Doc                                                          | Purpose                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| [docs/README.md](./docs/README.md)                           | Full documentation index                                           |
| [docs/agents/audience.md](./docs/agents/audience.md)         | Who the builders are; how to ask questions                         |
| [docs/architecture.md](./docs/architecture.md)               | Modules, routes, auth model                                        |
| [docs/updating-downstream.md](./docs/updating-downstream.md) | Port this template into forks; maintain `.convexplate-last-commit` |
| [docs/adr/](./docs/adr/)                                     | Architectural decisions                                            |
| [docs/testing.md](./docs/testing.md)                         | Why tests are not advised here                                     |

Bundled agent skills live in [`.agents/skills/`](./.agents/skills/) (grill-with-docs, tdd, triage, diagnose, shadcn, etc.). Claude Code loads the same skills from [`.claude/skills/`](./.claude/skills/) (per-skill symlinks).

## Conventions for agents

- Prefer extending existing `convex/lib/*` helpers over duplicating provisioning or auth logic.
- **Tests**: do not add unit, Cypress, or end-to-end tests. Creating tests in this repository is not advised. See [docs/testing.md](./docs/testing.md).
- Read ADRs before changing tenancy, onboarding, or platform admin behavior.
- **UI / shadcn**: read [docs/frontend.md](./docs/frontend.md) and the [shadcn skill](./.agents/skills/shadcn/SKILL.md) before UI work. Use `@/components/ui/*` primitives, sonner for toast, TanStack Form + shared Zod schemas for forms. Do not edit the vendored shadcn skill — update the bridge doc instead.
- **Updating a fork from this template**: use the [update-downstream skill](./.agents/skills/update-downstream/SKILL.md) and [docs/updating-downstream.md](./docs/updating-downstream.md). Read the downstream `.convexplate-last-commit` as the baseline, port changes surgically, then write that file with the applied convexplate commit hash.

## Agent skills

### Issue tracker

Issues for this template repo use **GitHub Issues** (`gh` CLI). See [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md). Forks may replace this when customizing.

### Triage labels

Canonical triage role → label mapping. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Vocabulary in this file + decisions in `docs/adr/`. See [docs/agents/domain.md](./docs/agents/domain.md). Forks may run `/grill-with-docs` to create a `CONTEXT.md` glossary.

### Audience and questions

Talk to the high-school builders as product decision-makers, not as engineers. See [docs/agents/audience.md](./docs/agents/audience.md).

### Downstream updates

Port this template into forks with [/update-downstream](./.agents/skills/update-downstream/SKILL.md). See [docs/updating-downstream.md](./docs/updating-downstream.md).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
