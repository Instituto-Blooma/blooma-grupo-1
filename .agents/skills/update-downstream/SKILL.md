---
name: update-downstream
description: >-
  Port convexplate template changes into a fork or product app while preserving
  product-specific code. Use when updating a downstream repo from convexplate,
  syncing a fork with the template, applying template upgrades cross-repo, or
  when the user mentions `.convexplate-last-commit`, "update from convexplate",
  or "port template changes".
---

# Update downstream from convexplate

AI-assisted, cross-repo port of shared template improvements into a fork.

Canonical guide: [docs/updating-downstream.md](../../../docs/updating-downstream.md).

## Preconditions

- Both roots available (sibling workspace dirs or absolute paths): **convexplate** + **downstream**.
- Confirm target convexplate ref (default `HEAD`). Do not guess a different tip.

## Workflow

Copy and track:

```
Downstream update:
- [ ] 1. Read baseline marker
- [ ] 2. Diff convexplate baseline..target
- [ ] 3. Inventory port vs preserve
- [ ] 4. Port surgically
- [ ] 5. Re-apply downstream customizations lost by wholesale copies
- [ ] 6. Install deps + regenerate if needed
- [ ] 7. Verify checks / fix port breakage
- [ ] 8. Write `.convexplate-last-commit`
```

### 1. Baseline

Read `<downstream>/.convexplate-last-commit` (full hash, one line).

If missing (first tracked update):

- Ask the user for a baseline, **or**
- Infer fork/import point by fingerprinting shared files against convexplate history
- Say which baseline you chose and why

### 2. Diff

In the convexplate clone:

```bash
git log --oneline <baseline>..HEAD
git diff --stat <baseline>..HEAD
```

Use a named target commit instead of `HEAD` when the user specifies one.

### 3. Inventory

Classify each delta:

| Port from convexplate                                        | Preserve downstream                               |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Shared `convex/lib/*`, authz/tenancy patterns                | Product schema, domain tables, business mutations |
| Platform admin / onboarding / invitations                    | Product routes, pages, copy                       |
| Form kit / UI primitives / frontend conventions              | `CONTEXT.md`, product ADRs, triage docs           |
| Setup scripts and env docs                                   | Downstream-only packages and integrations         |
| Template ADRs that still apply (renumber if ADR ids collide) | Renamed vocabulary / fork customization           |

When unsure: small surgical patch > wholesale file replace.

### 4. Port

- Prefer intent + shared infrastructure over blind overwrites.
- Wholesale is OK for clearly shared trees (e.g. `client/src/components/form/**`) **only if** you immediately re-apply known downstream patches (i18n labels, product error UX, etc.).
- Never wholesale-copy product `pages/`, `routes/` (except optional template-only `dev/*` demos), `CONTEXT.md`, or product ADRs.
- Schema/auth/onboarding/emails/users: merge surgically.
- If template ADR numbers collide with product ADRs, add under the next free number (e.g. plate `0002` → downstream `0006`).

### 5. Re-apply lost customizations

After any wholesale copy, diff against the downstream commit you started from and restore product-only behavior. Common traps:

- Form stepper action labels (`nextLabel` / `backLabel` / `submitLabel`)
- Friendly `ZodError` handling in form `errors.ts`
- Product auth providers, branding, survey/domain schemas

### 6. Install + codegen

- Update `package.json` / lockfile; run `pnpm install`.
- Regenerate Convex `_generated` and TanStack `routeTree.gen.ts` when modules/routes/components change (`npx convex dev` / project setup). Do not leave stale `presence`/`api` imports.

### 7. Verify

In the downstream repo:

```bash
pnpm install
pnpm run check   # or typecheck:all + lint if check is heavy
```

Fix failures **caused by the port**. Do not add tests; see [docs/testing.md](../../../docs/testing.md).

### 8. Marker (required)

Only after the port is complete and checks for ported areas look good, write `<downstream>/.convexplate-last-commit`:

```text
<full convexplate commit hash that was applied>
```

Rules:

- Single line, full hash, trailing newline OK
- Tip of the range you ported (`git rev-parse <target>` in convexplate)
- **Commit the marker** with the update; never gitignore it

## Done criteria

- Shared template changes from `baseline..target` applied without clobbering product code
- Downstream customizations on touched shared files restored
- Port-related checks green
- `.convexplate-last-commit` matches the applied convexplate tip

Do **not** commit or open a PR unless the user asks.
