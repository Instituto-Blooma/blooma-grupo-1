<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Agent skills

Bundled skills live in [`.agents/skills/`](./.agents/skills/) and are mirrored for Claude Code at [`.claude/skills/`](./.claude/skills/).

### Issue tracker

Issues for this template repo use **GitHub Issues** (`gh` CLI). See [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md). Forks may replace this when customizing.

### Triage labels

Canonical triage role → label mapping. See [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Vocabulary in [AGENTS.md](./AGENTS.md) + decisions in `docs/adr/`. See [docs/agents/domain.md](./docs/agents/domain.md). Forks may run `/grill-with-docs` to create a `CONTEXT.md` glossary.

### Audience and questions

Talk to the high-school builders as product decision-makers, not as engineers. See [docs/agents/audience.md](./docs/agents/audience.md).

### Tests

Do not add unit, Cypress, or end-to-end tests. Creating tests in this repository is not advised. See [docs/testing.md](./docs/testing.md).

### Downstream updates

Port this template into forks with [/update-downstream](./.agents/skills/update-downstream/SKILL.md). See [docs/updating-downstream.md](./docs/updating-downstream.md).
