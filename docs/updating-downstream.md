# Updating downstream repos from convexplate

How to pull improvements from this template into forks and product apps that started from convexplate (for example Talentum Portfolio OS).

Downstream updates are **AI-assisted and cross-repo**: open both this repo and the target app in the same workspace (or give the agent paths to both), then ask the agent to port the relevant changes.

## Marker file: `.convexplate-last-commit`

Every downstream repo that tracks convexplate **must** keep a root file:

```text
.convexplate-last-commit
```

Contents: a single line — the **full git commit hash** of the convexplate revision that was last successfully applied to that repo. No extra whitespace beyond a trailing newline.

Example:

```text
86fafc76c57edabb3d18fede632f4e6dd101367f
```

### Rules for agents

1. **Read first.** Before planning an update, read the downstream repo’s `.convexplate-last-commit` (if present). That hash is the baseline.
2. **Diff from baseline.** In the convexplate clone, compute changes since that commit:

   ```bash
   git log --oneline <baseline>..HEAD
   git diff <baseline>..HEAD
   ```

   Prefer a specific target commit over `HEAD` if the user names one.

3. **Port carefully.** Copy intent and shared infrastructure; do **not** blindly overwrite product-specific code, domain vocabulary, ADRs, or features that only exist downstream. Prefer surgical edits over wholesale file copies when the downstream file has diverged.
4. **Write the marker when done.** After the port is complete and checks look good, set `.convexplate-last-commit` in the **downstream** repo to the convexplate commit hash that was applied (the tip of the range you ported, usually `git rev-parse HEAD` in convexplate, or the commit the user requested).
5. **Commit the marker.** Include `.convexplate-last-commit` in the downstream update commit (or PR). Do **not** add it to `.gitignore`.

If the marker is missing (first tracked update after a fork), ask the user for a baseline commit, or use the fork point / initial import commit if known. Create the file at the end of that first update.

## Suggested agent prompt

Use something like this when starting an update:

> Update `<downstream-repo>` from convexplate. Read `.convexplate-last-commit` in the downstream repo as the baseline. Diff convexplate from that commit to `<target-ref>`. Port shared template changes without clobbering product-specific code. When finished, write `.convexplate-last-commit` with the applied convexplate commit hash.

Both repo roots should be available to the agent (sibling directories under a workspace, or explicit absolute paths).

## What to port vs leave alone

| Usually port from convexplate                         | Usually keep downstream as-is                           |
| ----------------------------------------------------- | ------------------------------------------------------- |
| Shared `convex/lib/*` helpers, authz/tenancy patterns | Product schema, domain tables, business mutations       |
| Platform admin / onboarding / invitation improvements | Product routes, pages, and copy                         |
| Form kit / UI primitives / frontend conventions       | `CONTEXT.md`, product ADRs, triage / issue-tracker docs |
| Setup scripts and env docs                            | Downstream-only packages and integrations               |
| Template ADRs that still apply                        | Renamed vocabulary and fork-specific customization      |

When unsure, prefer a small patch that preserves behavior over replacing an entire customized file.

## Verify after an update

In the downstream repo, run the project’s usual checks (typically `pnpm install`, then `pnpm run check`). Do not add tests; see [testing.md](./testing.md). Fix breaks caused by the port before treating the update as done and writing `.convexplate-last-commit`.

## Related

- [customization.md](./customization.md) — first-time fork checklist
- [architecture.md](./architecture.md) — shared module map
- [AGENTS.md](../AGENTS.md) — template vocabulary (downstream may override via `CONTEXT.md`)
- Agent skill: [.agents/skills/update-downstream/SKILL.md](../.agents/skills/update-downstream/SKILL.md)
