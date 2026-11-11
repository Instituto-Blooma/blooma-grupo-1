# Frontend UI conventions

Project-specific UI guidance for the B2B template. Domain vocabulary: [AGENTS.md](../AGENTS.md). Stack map: [architecture.md](./architecture.md).

For generic shadcn/ui CLI usage and component patterns, read the vendored skill at [.agents/skills/shadcn/SKILL.md](../.agents/skills/shadcn/SKILL.md). **This doc is the bridge** — it records where this repo intentionally differs from that skill.

## Stack

| Layer     | Choice                                                                                       |
| --------- | -------------------------------------------------------------------------------------------- |
| Framework | Vite + React 18 + TypeScript                                                                 |
| Routing   | TanStack Router (file routes in `client/src/routes/`, tree in `client/src/routeTree.gen.ts`) |
| UI        | shadcn/ui `new-york` style, **Radix** primitives (not the newer `base`/preset model)         |
| Styling   | Tailwind 3 + CSS variables in [client/src/index.css](../client/src/index.css)                |
| Forms     | TanStack Form + Zod (field-level validation, shared schemas with Convex mutations)           |
| Toast     | **sonner** (`toast()` + `<Toaster />`)                                                       |

## Where things live

| Concern                                  | Location                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| shadcn primitives                        | `client/src/components/ui/`                                                        |
| Form infrastructure                      | `client/src/components/form/`                                                      |
| App components                           | `client/src/components/`                                                           |
| Pages                                    | `client/src/pages/`                                                                |
| Routes                                   | `client/src/routes/`                                                               |
| `cn()` helper                            | [client/src/lib/utils.ts](../client/src/lib/utils.ts)                              |
| Theme tokens                             | [client/src/index.css](../client/src/index.css)                                    |
| shadcn config                            | [components.json](../components.json), [tailwind.config.ts](../tailwind.config.ts) |
| Shared form helpers + production schemas | `convex/lib/forms.ts` (isomorphic Zod, imported by client + server)                |
| Demo form schemas                        | `convex/devFormSchemas.ts` (dev showcase only; keep out of `lib/`)                 |

## Installed shadcn primitives

After setup, check `client/src/components/ui/` for the current list. Typical set:

- `button`, `card`, `avatar`, `dropdown-menu`, `tooltip`
- `input`, `label`, `select`, `checkbox`, `textarea`, `radio-group`, `switch` (form controls)

### Adding a component

```bash
pnpm dlx shadcn@latest add dialog tabs
```

Verify after add:

1. Uses Radix (this repo is `radix`, not `base`).
2. Imports use `@/` aliases from [components.json](../components.json).
3. Semantic tokens (`bg-primary`, `text-muted-foreground`) — no raw colors like `bg-blue-500`.
4. Matches existing `new-york` / neutral styling.

Run `pnpm dlx shadcn@latest docs <component>` before implementing unfamiliar components.

## Custom design systems (preserve these)

This template extends stock shadcn with:

- **`hover-elevate` / `active-elevate-2`** on interactive elements (see [client/src/index.css](../client/src/index.css)).
- **Semantic `-border` tokens** (`primary-border`, `card-border`, etc.) used by [button.tsx](../client/src/components/ui/button.tsx) and cards.
- **Dark mode** via `.dark` class ([ThemeProvider](../client/src/components/theme-provider.tsx)).

Do not remove these when updating components from upstream.

## Toast (sonner)

Use sonner for all toast feedback:

```tsx
import { toast } from 'sonner';

toast.success('Saved');
toast.error('Something went wrong');
```

Mount `<Toaster />` from `sonner` in [client/src/main.tsx](../client/src/main.tsx). Do not use the legacy Radix `useToast()` hook.

## Forms (TanStack Form + field-level Zod)

The form kit lives in [client/src/components/form/](../client/src/components/form/). **Validation and behavior are declared on each field**, not on the form root. That keeps fields reusable and mirrors the talentum-boilerplate DX.

### Conventions

1. Put production Zod schemas and validation helpers (`validationErrorPayload` / `parseOrThrow`) in `convex/lib/forms.ts`. Demo/example schemas belong next to the demo feature (e.g. `convex/devFormSchemas.ts`), not in `lib/`.
2. Each field passes its slice: `validation={mySchema.shape.email}`.
3. Convex mutations validate args with `parseOrThrow(schema, args)` (or `safeParse` + `validationErrorPayload`) and throw structured field errors on failure. Production examples: `platform.createOrganization`, `onboarding.provisionUser`. Demo: `devForm.submitDevForm`.
4. Use `applyServerErrors(form, error)` in `onSubmit` catch blocks to map server field errors back onto the form.
5. Wrap fields in `form.FormShell` (from `useAppForm`) and submit with `form.SubmitButton`.

### Basic example (typed `form.fields`)

`useAppForm<TValues, TSubmitValues>()` returns a generic form API. Use **`form.fields.*`** so field `name`, `validation`, `listenTo`, and serializers are checked against your `defaultValues` / shared Zod schema.

`onSubmit` receives **`value`** (serialized, mutation-ready) and **`unserializedValues`** (raw form state before field serializers). Pass `value` directly to Convex mutations — no manual `serializeValues` call.

When the form UI shape differs from the submit schema (optional fields, literals), pass a second generic:

```tsx
import {
  useAppForm,
  applyServerErrors,
  getSubmitErrorMessage,
  type AppFormSubmitArgs,
} from '@/components/form';
import { createOrganizationSchema, type CreateOrganizationValues } from '../../../convex/lib/forms';

type CreateOrganizationDefaultValues = {
  name: string;
  slug: string;
};

const form = useAppForm<CreateOrganizationDefaultValues, CreateOrganizationValues>({
  defaultValues: { name: '', slug: '' },
  onSubmit: async ({ value, unserializedValues, formApi }) => {
    try {
      await submitMutation(value);
      formApi.reset();
    } catch (error) {
      if (!applyServerErrors(formApi, error)) {
        toast.error(getSubmitErrorMessage(error));
      }
    }
  },
});

const { fields } = form;

<form.FormShell>
  <fields.Text name="name" label="Name" validation={createOrganizationSchema.shape.name} />
  <fields.Text name="slug" label="Slug" validation={createOrganizationSchema.shape.slug} />
  <form.SubmitButton>Submit</form.SubmitButton>
</form.FormShell>;
```

`serializeValues` / `deserializeValues` remain exported for persistence restore (`useFormPersistence` deserializes on load).

### Render isolation

Each field binds through TanStack `form.AppField`, so **only the edited field re-renders**. The form instance is provided via context (stable identity); live summaries use `form.Subscribe` selectors.

### Field-level props (`form.fields.*`)

| Prop                | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `name`              | Typed field path (`DeepKeys<TValues>`); array item fields use `keyof TItem` via render prop |
| `validation`        | Zod schema slice (Standard Schema)                                                          |
| `listenTo`          | Cross-field reactions `{ otherField: (other, mine, all) => next }`                          |
| `serialize`         | Transform value before submit / persistence                                                 |
| `deserialize`       | Transform value when restoring defaults                                                     |
| `changeListener`    | Side effect when the field value changes                                                    |
| `searchOptions`     | Async combobox search `(term) => Promise<SelectOption[]>`                                   |
| `searchPlaceholder` | Combobox filter input placeholder                                                           |
| `emptyMessage`      | Combobox empty-state copy                                                                   |
| `data-testid`       | Optional stable hook (`{id}-search` on combobox filter input)                               |

### Reusable domain fields

```tsx
import { provisionUserSchema } from '../../../convex/lib/forms';

export function EmailField(props: { name: 'email'; label?: string }) {
  const form = useAppFormContext<{ email: string }>();
  return (
    <form.fields.Text
      type="email"
      label="Email"
      validation={provisionUserSchema.shape.email}
      {...props}
    />
  );
}
```

### Other form primitives

- `form.fields.Select` — searchable single-select combobox (`Popover` + `Command`); optional `searchOptions` for async lookup
- `form.fields.MultiSelect` — multi-select combobox with removable badge chips
- `form.fields.RadioGroup` — classic radio list
- `form.fields.RadioCard` — single-select card grid (`InputCard` options with title/description/icon); optional `maxColumns` (`number` or media-query map) and per-card `color`
- `form.fields.CheckboxCard` — multi-select card grid (same option shape as `RadioCard`); optional `maxColumns` (`number` or media-query map), `maxSelections`, and per-card `color`

`maxColumns` examples:

```tsx
maxColumns={2}
maxColumns={{ xs: 1, sm: 2, lg: 3 }}
```

Breakpoint keys match Tailwind defaults: `xs` (base), `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

- `FormArray` — repeatable rows with `min` / `max`; pass `(itemFields) => …` for typed nested fields
- `FormStepper`, `FormStep`, `FormStepField`, `FormStepHeader`, `FormStepActions` — multi-step wizard. Each `FormStep` registers a required `label` and optional `icon` into `stepConfig`. `FormStepField` registers fields so per-step validation uses `fieldSteps` (no hand-maintained step map). Non-current steps stay mounted (`hidden`) so serializers and field state persist through submit.
  - `FormStepHeader` — clickable progress UI (place inside `FormShell`). Jump **back** freely; jump **forward** only after validating every step in `[current, target)`. Without an `icon`, the header shows 1-based step numbers. Pass icons as elements (`icon={<Icon className="size-4" />}`); the stepper stores them outside React state so unstable JSX identities cannot re-render-loop. Optional `maxShownSteps` windows the visible steps (centered on current, clamped at ends); when steps are clipped, a `{current}/{total}` subtitle appears (`data-testid="form-step-header-progress"`).
- `useFormPersistence(form, { id })` — localStorage autosave (skips sensitive field names); restores via `deserializeValues`
- `FormSection`, `FormValue` — layout and live read-only display
- `form.fields.Date`, `form.fields.File` — calendar popover date (ISO) and Convex storage upload fields
- `form.fields.Color` — popover hex color picker (`react-colorful`) with manual hex input; value is `#RRGGBB`; validate with a hex Zod schema (see `hexColorSchema` in `convex/devFormSchemas.ts` for an example)
- `form.fields.RichText` — MDXEditor markdown string field; lazy-loaded, prose + dark-theme aware. Optional `collab={{ documentId, user }}` switches to CRDT mode via `@talentum-ventures/convex-presence` (`useCollabDoc` + `/lexical` `LexicalCollabBinding`, live carets + facepile). Authoritative collab content is the synced CRDT doc; app mutations persist an eventually-consistent markdown snapshot for non-collab readers. Form mode is write-through while focused (`setMarkdown` only when unfocused) so caret does not jump on each keystroke — see [ADR 0002](./adr/0002-yjs-collab-and-org-scoped-presence.md).
- `clearServerFieldError(form, name)` — clear a server-mapped field error when the user edits the field

Reference implementation: [client/src/pages/dev-form.tsx](../client/src/pages/dev-form.tsx) at `/dev/form` (dev-only route). It is the **field-type showcase** for the form stack: a single typed `useAppForm` wired through `FormStepper` with three steps exercising `form.fields.*` (including `RichText`), `FormArray` item fields, `form.fields.Hidden` (`listenTo` on age → `isAdult`), optional file upload, `FormValue`, persistence, and Convex server field errors (`server-error@example.com`).

Collaborative rich text demo: [client/src/pages/dev-richtext-collab.tsx](../client/src/pages/dev-richtext-collab.tsx) at `/dev/richtext-collab` (dev-only). Org-scoped document ids and presence rooms are enforced in [convex/collab.ts](../convex/collab.ts); see [ADR 0002](./adr/0002-yjs-collab-and-org-scoped-presence.md).


## Conventions

- **Use `@/components/ui/*`** for buttons, inputs, cards, menus — not raw `<input>` / `<select>` with ad-hoc Tailwind.
- **Use `@/components/form/*`** for all data-entry forms — not inline `useForm` / `form.Field` boilerplate.
- **Semantic colors only** — `bg-background`, `text-muted-foreground`, `border-border`; never `text-emerald-600` for status.
- **`cn()` for conditional classes** — from `@/lib/utils`.
- **Dev routes** — gate with `requireDevTools()` in route `beforeLoad` ([client/src/lib/route-guards.ts](../client/src/lib/route-guards.ts)).

## Bridge: this repo vs the vendored shadcn skill

| Topic               | Vendored skill                        | This repo                                               |
| ------------------- | ------------------------------------- | ------------------------------------------------------- |
| Toast               | sonner                                | sonner (same)                                           |
| Form layout         | `Field` / `FieldGroup` / `InputGroup` | `@/components/form` field components + TanStack Form    |
| Preset / base model | Preset codes, `base` vs `radix`       | `new-york` + Radix only; ignore preset workflow         |
| Elevation           | Stock shadcn                          | Custom `hover-elevate` system                           |
| Validation          | Skill examples vary                   | Field-level Zod slices + whole-schema Convex validation |

When the skill and this doc disagree on repo-specific items, **this doc wins**.

## For AI agents

1. Read this doc before UI work.
2. Read [.agents/skills/shadcn/SKILL.md](../.agents/skills/shadcn/SKILL.md) for component API and CLI commands.
3. Run `pnpm dlx shadcn@latest docs <component>` before guessing component usage.
4. Check installed components before running `add`.
5. Never edit vendored `.agents/skills/shadcn/**` — update this bridge doc instead.
