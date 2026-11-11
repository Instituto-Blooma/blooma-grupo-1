import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  convexEnvHas,
  loadConvexEnv,
  readConvexEnv,
  runLocalConvexPushOnce,
  setConvexEnvVar,
  unsetConvexEnvVar,
} from './convex-env.mjs';
import { readEnvLocalVar, removeEnvLocalVar } from './env-file.mjs';
import {
  ensureConvexCodegenAuthEnv,
  ensureProxiedEnvFileUrls,
  getCustomAuthSiteUrl,
  getEmulatePublicUrl,
  getProxiedConvexSiteUrl,
  getProxiedConvexUrl,
  getPublicAppBase,
  getResendEmulatePublicUrl,
  isProxiedLocalConvex,
  prepareContainerProcessEnv,
  stripProxiedViteConvexVars,
} from './env-urls.mjs';
import {
  acquireSetupLock,
  generateConvexAuthKeys,
  log,
  ROOT_DIR,
  SETUP_SENTINEL_FILE,
  stampJwksKids,
} from './lib.mjs';
import { seedDevFixtures } from './seed.mjs';

prepareContainerProcessEnv();

function needsLocalBootstrap() {
  return !readEnvLocalVar('VITE_CONVEX_URL');
}

function needsPrBootstrap() {
  const envLocalPath = join(ROOT_DIR, '.env.local');
  if (!existsSync(envLocalPath)) {
    return true;
  }
  const contents = readFileSync(envLocalPath, 'utf8');
  return !/^CONVEX_DEPLOYMENT=(local|anonymous):/m.test(contents);
}

function prepareWorkspace(tag) {
  process.env.CONVEX_TMPDIR = join(homedir(), '.cache/convex/tmp');
  mkdirSync(process.env.CONVEX_TMPDIR, { recursive: true });

  if (process.env.RESET_CONVEX_DASHBOARD_CACHE === '1') {
    log(tag, 'Clearing Convex dashboard cache...');
    rmSync(join(homedir(), '.cache/convex/dashboard'), { recursive: true, force: true });
  }

  if (!existsSync(join(ROOT_DIR, 'node_modules'))) {
    log(tag, 'Installing dependencies...');
    execSync('pnpm install', { cwd: ROOT_DIR, stdio: 'inherit' });
  } else {
    log(tag, 'Dependencies already installed.');
  }
}

async function runLocalConvexBootstrap(message, tag) {
  log(tag, message);
  ensureConvexCodegenAuthEnv();
  const extraArgs = process.env.CI ? '' : ' --local-force-upgrade';
  const convexEnv = {
    ...process.env,
    CI: process.env.CI ?? 'true',
    CONVEX_AGENT_MODE: 'anonymous',
    NODE_OPTIONS: '--dns-result-order=ipv4first',
  };
  // Convex 1.43 removed `--local`; anonymous `init` writes CONVEX_DEPLOYMENT,
  // then `dev --once` uses that local deployment (Railway PR / CI codegen).
  execSync('npx convex init', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: convexEnv,
    timeout: 600_000,
  });
  return runLocalConvexPushOnce(tag, {
    extraArgs,
    env: convexEnv,
  });
}

function configureProxiedUrls(tag) {
  if (!isProxiedLocalConvex()) {
    return;
  }

  log(tag, 'Proxied local Convex detected — .env.local stays loopback-only for Convex.');
  stripProxiedViteConvexVars();
  ensureProxiedEnvFileUrls();
  log(tag, 'Public browser URLs (exported by dev-all at runtime, not written to .env.local):');
  log(tag, `VITE_CONVEX_URL=${getProxiedConvexUrl()}`);
  log(tag, `VITE_CONVEX_SITE_URL=${getProxiedConvexSiteUrl()}`);
}

async function configureAuthEnv(tag) {
  loadConvexEnv();
  const webServerUrl = getPublicAppBase();
  const emulateUrl = getEmulatePublicUrl();

  if (convexEnvHas('JWT_PRIVATE_KEY') && convexEnvHas('JWKS')) {
    const current = readConvexEnv('JWKS');
    const stamped = stampJwksKids(current ?? '');
    if (stamped.changed) {
      log(tag, 'Stamping RFC 7638 kid onto existing Convex Auth JWKS...');
      await setConvexEnvVar('JWKS', stamped.json);
    } else {
      log(tag, 'Convex Auth keys already configured.');
    }
  } else {
    log(tag, 'Generating Convex Auth keys (non-interactive)...');
    const keys = await generateConvexAuthKeys();
    await setConvexEnvVar('JWT_PRIVATE_KEY', keys.JWT_PRIVATE_KEY);
    await setConvexEnvVar('JWKS', keys.JWKS);
  }

  log(tag, `Setting SITE_URL to ${webServerUrl}...`);
  await setConvexEnvVar('SITE_URL', webServerUrl);

  if (isProxiedLocalConvex()) {
    const customAuthSiteUrl = getCustomAuthSiteUrl();
    log(tag, `Setting CUSTOM_AUTH_SITE_URL to ${customAuthSiteUrl}...`);
    await setConvexEnvVar('CUSTOM_AUTH_SITE_URL', customAuthSiteUrl);
  } else if (convexEnvHas('CUSTOM_AUTH_SITE_URL')) {
    log(tag, 'Removing CUSTOM_AUTH_SITE_URL (not needed for direct Convex cloud access)...');
    await unsetConvexEnvVar('CUSTOM_AUTH_SITE_URL');
  }

  if (convexEnvHas('AUTH_GOOGLE_ID')) {
    log(tag, 'AUTH_GOOGLE_ID is set — using real Google OAuth (clearing emulate URL)...');
    await unsetConvexEnvVar('AUTH_GOOGLE_EMULATE_URL');
  } else {
    log(tag, `Setting AUTH_GOOGLE_EMULATE_URL to ${emulateUrl}...`);
    await setConvexEnvVar('AUTH_GOOGLE_EMULATE_URL', emulateUrl);
  }

  const legacyPlatformAdminEmails = 'admin@example.com,platform@example.com';
  const platformAdminEmails =
    'dev@example.com,admin@example.com,platform@example.com,testuser@gmail.com';
  const currentPlatformAdminEmails = readConvexEnv('PLATFORM_ADMIN_EMAILS');
  if (!currentPlatformAdminEmails || currentPlatformAdminEmails === legacyPlatformAdminEmails) {
    log(tag, `Setting PLATFORM_ADMIN_EMAILS to ${platformAdminEmails}...`);
    await setConvexEnvVar('PLATFORM_ADMIN_EMAILS', platformAdminEmails);
  } else {
    log(tag, 'PLATFORM_ADMIN_EMAILS already configured.');
  }

  const resendEmulateUrl = getResendEmulatePublicUrl();
  log(tag, `Setting RESEND_BASE_URL to ${resendEmulateUrl}...`);
  await setConvexEnvVar('RESEND_BASE_URL', resendEmulateUrl);
  await setConvexEnvVar('RESEND_API_KEY', 're_emulate_test_key');

  if (readEnvLocalVar('E2E_AUTH_SECRET')) {
    log(tag, 'Removing E2E_AUTH_SECRET from .env.local...');
    removeEnvLocalVar('E2E_AUTH_SECRET');
  }
  if (convexEnvHas('E2E_AUTH_SECRET')) {
    log(tag, 'Removing E2E_AUTH_SECRET from Convex env...');
    await unsetConvexEnvVar('E2E_AUTH_SECRET');
  }
  if (convexEnvHas('E2E')) {
    log(tag, 'Removing E2E from Convex env...');
    await unsetConvexEnvVar('E2E');
  }
}

function writeSentinel() {
  writeFileSync(SETUP_SENTINEL_FILE, `${new Date().toISOString()}\n`, 'utf8');
}

async function runSetup(mode) {
  const tag = mode === 'pr' ? 'setup-pr' : 'setup';

  if (existsSync(SETUP_SENTINEL_FILE)) {
    log(tag, 'Setup already completed once. Validating and repairing configuration if needed.');
  }

  const releaseLock = await acquireSetupLock(tag);
  try {
    prepareWorkspace(tag);

    let functionsPushed = true;
    if (mode === 'local') {
      if (needsLocalBootstrap()) {
        functionsPushed = await runLocalConvexBootstrap(
          'Starting one-time Convex local setup...',
          tag
        );
      } else {
        log(tag, 'Existing local Convex settings found in .env.local.');
      }
    } else if (needsPrBootstrap()) {
      functionsPushed = await runLocalConvexBootstrap(
        'Railway local Convex — bootstrapping...',
        tag
      );
    } else {
      log(tag, 'Existing local Convex settings found in .env.local.');
    }

    configureProxiedUrls(tag);
    await configureAuthEnv(tag);

    if (!functionsPushed) {
      const retried = await runLocalConvexBootstrap(
        'Retrying Convex push after setting required env...',
        tag
      );
      if (!retried) {
        throw new Error('Convex bootstrap still failed after setting required env vars.');
      }
    }

    if (mode === 'local' && !process.env.CI) {
      log(tag, 'Seeding local dev data (first-setup emulator users)...');
      seedDevFixtures();
    }

    writeSentinel();
    log(
      tag,
      mode === 'pr'
        ? 'Setup complete. You can rerun this script any time to repair Railway local/PR preview auth.'
        : 'Setup complete. You can rerun this script any time to repair local auth.'
    );
  } finally {
    releaseLock();
  }
}

const mode = process.argv[2] === 'pr' ? 'pr' : 'local';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSetup(mode);
}

export { runSetup };
