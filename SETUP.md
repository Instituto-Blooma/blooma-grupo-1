# Setup Guide

B2B SaaS template with local Convex, Google OAuth emulation, and Resend invitation email emulation.

## Environment matrix

| Environment            | Convex backend       | Google auth                         | Key setup                                                                                  |
| ---------------------- | -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| **Local dev**          | Local (anonymous)    | Emulate (default)                   | `pnpm run setup && pnpm run dev:all`                                                       |
| **Railway local / PR** | Local + Vite proxies | Emulate (default)                   | Base env `local`; [`environments.local`](railway.toml) + [`environments.pr`](railway.toml) |
| **Railway staging**    | Cloud                | Emulate unless `AUTH_GOOGLE_ID` set | Build: `pnpm run build`; pre-deploy: `pnpm run deploy:convex`                              |
| **Railway production** | Cloud                | Real Google                         | `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`; no emulate                                        |

## Quick Start (Local)

```bash
pnpm install
pnpm run setup
pnpm run dev:all
```

1. Open `http://localhost:5173`
2. Sign in with a first-setup emulator user — **Dev User**, **Test User**, or `platform@example.com`. You land in **Acme Corp** with sample todos.

You do not need to manually create `.env.local` — `pnpm run setup` writes it.

## Quick Start (Railway)

### Local env and PR preview (local Convex)

The named Railway env **`local`** and PR previews both use [`environments.local`](railway.toml) / [`environments.pr`](railway.toml) (same commands):

| Step           | Command                                                              |
| -------------- | -------------------------------------------------------------------- |
| **Build**      | `node script/run.mjs railway build` (local Convex codegen only)      |
| **Pre-deploy** | `node script/run.mjs railway predeploy` (no cloud `convex deploy`)   |
| **Start**      | `node script/run.mjs railway start` → `setup.mjs pr` + `run.mjs dev` |

This runs local Convex, Google emulate (when `AUTH_GOOGLE_ID` and `E2E_AUTH_SECRET` are absent), and Vite with proxies for `/_convex`, `/_convex_site`, and `/google-emulate`.

**Railway dashboard setup:**

1. Create a Railway environment named **`local`** with **no** cloud-Convex variables (no `CONVEX_DEPLOY_KEY`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, or `PUBLIC_APP_URL`).
2. Set the **PR preview base environment** to **`local`** so PR deployments inherit a clean variable set instead of staging.
3. Keep cloud Convex vars (`CONVEX_DEPLOY_KEY`, `VITE_CONVEX_*`) on **staging** and **production** only.

### Staging (cloud Convex)

Railway runs:

1. **Build:** `pnpm run build` (`convex dev --once` for codegen + Vite static build)
2. **Pre-deploy:** `pnpm run deploy:convex`
3. **Start:** `node script/run.mjs railway serve` → `start:deploy` (emulate starts when `AUTH_GOOGLE_ID` is absent; Resend uses the real API)

Set on the **Convex cloud deployment**:

```bash
pnpm convex env set SITE_URL "https://your-staging-domain.railway.app"
pnpm convex env set AUTH_GOOGLE_EMULATE_URL "https://your-staging-domain.railway.app/google-emulate"
```

Set on **Railway** (build-time for the static client):

- `CONVEX_DEPLOY_KEY`
- `VITE_CONVEX_URL` — cloud Convex API URL
- `VITE_CONVEX_SITE_URL` — cloud Convex site URL

### Production (cloud Convex + real Google)

Same as staging, but set Google credentials on Convex and **do not** set `AUTH_GOOGLE_EMULATE_URL`:

```bash
pnpm convex env set AUTH_GOOGLE_ID "your-google-client-id"
pnpm convex env set AUTH_GOOGLE_SECRET "your-google-client-secret"
pnpm convex env set SITE_URL "https://your-production-domain"
pnpm convex env remove AUTH_GOOGLE_EMULATE_URL
```

Add the Google OAuth redirect URI:

```text
https://YOUR_CONVEX_DEPLOYMENT.convex.site/api/auth/callback/google
```

## What `pnpm run setup` Does

- Installs dependencies if needed
- Bootstraps a **local Convex** development backend (`convex init` + `dev --once`; anonymous mode when not logged in)
- Generates Convex Auth keys (`JWT_PRIVATE_KEY`, `JWKS` with RFC 7638 `kid`) non-interactively
- Sets `SITE_URL`, `CUSTOM_AUTH_SITE_URL` (proxied PR only), `AUTH_GOOGLE_EMULATE_URL`, `PLATFORM_ADMIN_EMAILS` (includes first-setup emulator emails), and Resend emulate env on Convex
- Seeds first-setup users (`dev@example.com`, `platform@example.com`, `testuser@gmail.com`) as active platform admins in **Acme Corp**, with sample todos, so Google emulate sign-in is ready to use
- Keeps `.env.local` loopback-only on proxied PR preview; `dev:all` exports public `VITE_CONVEX_*` URLs to Vite at runtime
- Writes `.setup-done` on success

## Dev Stack (`pnpm run dev:all`)

| Service              | Local port | Vite proxy        |
| -------------------- | ---------- | ----------------- |
| Vite (app)           | 5173       | —                 |
| Convex API           | 3210+      | `/_convex`        |
| Convex site / auth   | 3211+      | `/_convex_site`   |
| Google OAuth emulate | 4002       | `/google-emulate` |
| Resend emulate       | 4003       | `/resend-emulate` |
| Convex dashboard     | 6790       | `/_dashboard`     |

Exact Convex ports come from `.env.local` after setup.

On Railway local/PR, URL detection uses `RAILWAY_PUBLIC_DOMAIN` when `PUBLIC_APP_URL` is unset.

## Tests

Do not add unit, Cypress, or end-to-end tests in this repository. See [docs/testing.md](./docs/testing.md).

## Troubleshooting

- **Missing `.env.local`**: run `pnpm run setup`
- **Port conflicts**: `dev:all` frees stale ports automatically; stop other Convex/Vite processes
- **Railway PR preview `ECONNREFUSED 127.0.0.1:3210`**: anonymous local Convex may listen on dynamic ports. `.env.local` must stay loopback-only; public `/_convex` URLs are process env only
- **`/_dashboard` 404 on PR preview**: redeploy with `RESET_CONVEX_DASHBOARD_CACHE=1` to clear the entire dashboard cache
- **Sign-in fails**: confirm `AUTH_GOOGLE_EMULATE_URL` and that emulate is running. If logs say `E2E programmatic auth — skipping Google emulate`, unset `E2E_AUTH_SECRET` for manual sign-in. **Unprovisioned User** is supposed to fail. Use **Dev User** or **Test User**. If those fail after an older setup, rerun `pnpm run setup` (or `pnpm run seed:dev`) to refresh the allowlist and seed.
- **`Invalid state` in Convex logs after a successful sign-in**: the Google callback sometimes runs twice; Convex Auth consumes the verifier on the first success and the retry logs this. If you landed on the dashboard, you can ignore it.
- **Production `CUSTOM_AUTH_SITE_URL`**: do not reference it from `auth.config.ts` — it is PR-only
