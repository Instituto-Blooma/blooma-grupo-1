# Customization checklist

After remixing or forking this template, work through these steps before building product features.

## 1. Run setup and verify full mode

```bash
pnpm install
pnpm run setup
pnpm run dev:all
```

Confirm:

- `.setup-done` exists
- `.env.local` has `VITE_CONVEX_URL`
- App shows sign-in (not demo mode)

See [SETUP.md](../SETUP.md).

## 2. Replace domain language

1. Read domain vocabulary in [AGENTS.md](../AGENTS.md).
2. Run `/grill-with-docs` with your product expert to rename concepts (e.g. replace example Organizations, adjust role names if needed). This can create a `CONTEXT.md` glossary for your fork.
3. Update UI copy in `client/src/pages/*` to match your vocabulary.
4. Review [frontend.md](./frontend.md) for shadcn/ui and form conventions before building new UI.

## 3. Platform admin bootstrap

Set Convex env for your team's emails:

```bash
npx convex env set PLATFORM_ADMIN_EMAILS "you@yourstartup.com,ops@yourstartup.com"
```

Add matching personas to `emulate.config.yaml` for local Google sign-in.

## 4. Production auth and email

| Service          | Action                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Google OAuth     | Create credentials; set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`; unset `AUTH_GOOGLE_EMULATE_URL` |
| Resend           | Real API key; set `RESEND_FROM` to verified domain; remove emulate `RESEND_BASE_URL`            |
| Replit / hosting | `CONVEX_DEPLOY_KEY`, production `VITE_CONVEX_URL`, `SITE_URL`                                   |

Details: [environment.md](./environment.md), [SETUP.md](../SETUP.md) production section.

## 5. Remove or repurpose demo surfaces

| Item           | Location                            | Suggestion                                        |
| -------------- | ----------------------------------- | ------------------------------------------------- |
| Todos demo     | `convex/todos.ts`, dashboard        | Replace with your first org-scoped feature        |
| Dev routes     | `/dev/*` in `client/src/routes/`    | Remove or gate behind your own flag               |
| Local seed users | `convex/testing/e2e.ts`          | Dev-only seed. Do not turn this into a test suite |
| Example emails   | `emulate.config.yaml`            | Align with your domain                            |

Keep the **pattern**: `organizationId` on tables + authz checks in `convex/todos.ts`.

## 6. Extend the data model

For each new org-scoped table:

1. Add `organizationId: v.string()` (or consistent org key type).
2. Index by org where you list/filter.
3. Enforce permissions in every public query and mutation (see ADR 0001).
4. On member departure, hook **Succession** if resources have `createdBy` — see `convex/lib/succession.ts`.

## 7. Issue tracker and agent docs (optional)

If you use GitHub Issues, update [docs/agents/issue-tracker.md](./agents/issue-tracker.md). If you use Linear/Jira, replace that file and the `## Agent skills` section in [AGENTS.md](../AGENTS.md).

Map your triage labels in [docs/agents/triage-labels.md](./agents/triage-labels.md).

## 8. Add ADRs sparingly

Create a new ADR in `docs/adr/` only when a decision is hard to reverse, surprising without context, and the result of a real trade-off. Use [.agents/skills/grill-with-docs/ADR-FORMAT.md](../.agents/skills/grill-with-docs/ADR-FORMAT.md).

## 9. Track template updates

After the fork is product-shaped, keep a root `.convexplate-last-commit` file so later pulls from this template have a clear baseline. See [updating-downstream.md](./updating-downstream.md).

## Related

- [architecture.md](./architecture.md)
- [onboarding.md](./onboarding.md)
- [updating-downstream.md](./updating-downstream.md)
- [testing.md](./testing.md)
