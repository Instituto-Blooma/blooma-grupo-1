import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { log, ROOT_DIR, runConvex } from './lib.mjs';

function requireEnvLocal() {
  const envLocalPath = `${ROOT_DIR}/.env.local`;
  if (!existsSync(envLocalPath)) {
    log('seed', 'Missing .env.local — run pnpm run setup first');
    process.exit(1);
  }
}

export function seedDevFixtures() {
  requireEnvLocal();
  runConvex(`npx convex run testing/e2e:seedAdminUser '{"name":"Dev User"}'`, {
    logLabel: 'Seeding dev admin user...',
  });
}

async function main() {
  const mode = process.argv[2] ?? 'dev';
  if (mode === 'dev') {
    seedDevFixtures();
    return;
  }
  log('seed', `Unknown mode: ${mode} (expected dev)`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
