import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { requireE2eAuthSecret } from './env-file.mjs';
import { syncE2eAuthSecretToConvex } from './env-urls.mjs';
import { log, readE2eContext, ROOT_DIR, runConvex, writeE2eContext } from './lib.mjs';

function resolveAnchorDate(anchorDate) {
  if (anchorDate) {
    return anchorDate;
  }
  if (process.env.E2E_ANCHOR_DATE) {
    return process.env.E2E_ANCHOR_DATE;
  }
  return new Date().toISOString().slice(0, 10);
}

function requireEnvLocal() {
  const envLocalPath = `${ROOT_DIR}/.env.local`;
  if (!existsSync(envLocalPath)) {
    log('seed', 'Missing .env.local — run pnpm run setup first');
    process.exit(1);
  }
}

function configureE2eConvexEnv() {
  runConvex('npx convex env set E2E true', { logLabel: 'Setting E2E=true on Convex...' });
  runConvex('npx convex env set RESEND_BASE_URL "http://localhost:4003"', {
    logLabel: 'Setting RESEND_BASE_URL for E2E...',
  });
  runConvex('npx convex env set RESEND_API_KEY "re_emulate_test_key"', {
    logLabel: 'Setting RESEND_API_KEY for E2E...',
  });
}

/**
 * Seed admin user and reset Cypress fixtures; write e2e-context.json.
 */
export function resetE2eFixtures({ anchorDate } = {}) {
  const resolvedAnchor = resolveAnchorDate(anchorDate);
  const sessionEpoch = String(Date.now());

  configureE2eConvexEnv();

  runConvex(`npx convex run testing/e2e:seedAdminUser "{\\"name\\":\\"Dev User\\"}" --push`, {
    logLabel: 'Seeding admin user...',
  });

  const contextJson = runConvex(`npx convex run testing/e2e:reset "{}" --push`, {
    logLabel: 'Resetting E2E fixtures...',
  });

  const context = {
    ...JSON.parse(contextJson),
    sessionEpoch,
    anchorDate: resolvedAnchor,
  };
  writeE2eContext(context);
  return context;
}

export function readSessionEpoch() {
  const ctx = readE2eContext();
  return ctx?.sessionEpoch ?? null;
}

export function readAnchorDateFromContext() {
  const ctx = readE2eContext();
  return ctx?.anchorDate ?? null;
}

export function seedDevFixtures() {
  requireEnvLocal();
  runConvex(`npx convex run testing/e2e:seedAdminUser "{\\"name\\":\\"Dev User\\"}"`, {
    logLabel: 'Seeding dev admin user...',
  });
  runConvex(`npx convex run demo:seedHospitals "{}"`, {
    logLabel: 'Seeding demo hospitals (sectors, beds, medication requests)...',
  });
}

export async function seedE2eFixtures() {
  requireEnvLocal();
  requireE2eAuthSecret();
  await syncE2eAuthSecretToConvex();

  if (!process.env.E2E_ANCHOR_DATE) {
    process.env.E2E_ANCHOR_DATE = new Date().toISOString().slice(0, 10);
  }

  resetE2eFixtures();
  log('seed-e2e', 'Wrote cypress/fixtures/e2e-context.json');
}

async function main() {
  const mode = process.argv[2] ?? 'dev';
  if (mode === 'dev') {
    seedDevFixtures();
    return;
  }
  if (mode === 'e2e') {
    await seedE2eFixtures();
    return;
  }
  log('seed', `Unknown mode: ${mode} (expected dev or e2e)`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
