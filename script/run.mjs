import { execSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import {
  applyPublicViteConvexEnv,
  cleanupStaleDevPorts,
  ensureConvexCodegenAuthEnv,
  ensureProxiedEnvFileUrls,
  getProxiedConvexSiteUrl,
  getProxiedDashboardUrl,
  getPublicAppBase,
  isProxiedLocalConvex,
  isPublicProxyHost,
  isRemoteDevHost,
  prepareContainerProcessEnv,
  readLocalConvexBackendEnv,
  readLocalConvexBackendTargets,
  stripProxiedViteConvexVars,
  waitForConvexBackendPort,
  waitForConvexDashboardPort,
  waitForConvexLoopbackEnv,
  waitForEmulatePort,
} from './env-urls.mjs';
import { shouldStartGoogleEmulate, usesGoogleOAuthCredentials } from './auth-mode.mjs';
import { readEnvFile, readEnvLocalVar } from './env-file.mjs';
import { ensurePrBrandingEnv } from './app-branding.mjs';
import { log, monitorPids, ROOT_DIR, spawnShellBackground } from './lib.mjs';
import { runSetup } from './setup.mjs';
import { seedDevFixtures } from './seed.mjs';
import { pushLocalConvexWithEnv } from './convex-env.mjs';

prepareContainerProcessEnv();

/**
 * The Railway image's Nix node is older than package.json engines.
 * When the build unpacked Node 22.22.2 into `.node-runtime`, start on that binary
 * so `pnpm` stops printing an unsupported-engine warning.
 */
function relaunchWithPinnedNode() {
  const binDir = join(ROOT_DIR, '.node-runtime', 'bin');
  const pinned = join(binDir, 'node');
  if (!existsSync(pinned)) {
    return false;
  }
  const pathValue = process.env.PATH ?? '';
  if (!pathValue.split(delimiter).includes(binDir)) {
    process.env.PATH = `${binDir}${delimiter}${pathValue}`;
  }
  if (realpathSync(process.execPath) === realpathSync(pinned)) {
    return false;
  }
  const child = spawn(pinned, process.argv.slice(1), {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
  });
  const forward = (signal) => {
    child.kill(signal);
  };
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGINT', () => forward('SIGINT'));
  child.on('error', () => {
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    process.exit(signal ? 0 : (code ?? 1));
  });
  return true;
}

const POLL_INTERVAL_MS = 4000;
const FALLBACK_ADMIN = { email: 'dev@example.com', name: 'Dev User' };
const FIRST_SETUP_EMULATE_USERS = [
  FALLBACK_ADMIN,
  { email: 'platform@example.com', name: 'Platform Admin' },
  { email: 'testuser@gmail.com', name: 'Test User' },
];
/** OAuth-only personas for Cypress attempt-mode flows (not necessarily in Convex DB). */
const EMULATE_OAUTH_EXTRA_USERS = [
  { email: 'unprovisioned@example.com', name: 'Unprovisioned User' },
];

function mergeEmulateUsers(dbUsers) {
  const byEmail = new Map();
  for (const user of [...dbUsers, ...EMULATE_OAUTH_EXTRA_USERS]) {
    if (user?.email) {
      byEmail.set(user.email.toLowerCase(), user);
    }
  }
  return [...byEmail.values()];
}

/** @type {import('node:child_process').ChildProcess[]} */
let trackedChildren = [];

function cleanupChildren() {
  for (const child of trackedChildren) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  trackedChildren = [];
}

async function waitForDashboardAsync() {
  log('dev-all', 'Waiting for Convex dashboard...');
  if (await waitForConvexDashboardPort()) {
    log('dev-all', `Convex dashboard: ${getProxiedDashboardUrl()}`);
  } else {
    log('dev-all', 'WARN: Timed out waiting for Convex dashboard; /_dashboard may 404 briefly.');
  }
}

function seedDevPreviewFixtures() {
  log('dev-all', 'Seeding dev preview fixtures...');
  try {
    seedDevFixtures();
    log('dev-all', 'Dev preview fixtures ready.');
  } catch {
    log('dev-all', 'WARN: Dev preview seed failed; preview DB may be empty.');
  }
}

function prepareProxiedViteEnv() {
  log('dev-all', 'Proxied local Convex — keeping .env.local loopback-only for Convex...');
  stripProxiedViteConvexVars();
  ensureProxiedEnvFileUrls();
  Object.assign(process.env, readLocalConvexBackendEnv());
  applyPublicViteConvexEnv(process.env);

  log('dev-all', 'Loopback backend (Vite proxy + .env.local):');
  log('dev-all', `VITE_CONVEX_BACKEND_URL=${process.env.VITE_CONVEX_BACKEND_URL}`);
  log('dev-all', `VITE_CONVEX_BACKEND_SITE_URL=${process.env.VITE_CONVEX_BACKEND_SITE_URL}`);
  log('dev-all', 'Public browser URLs (process env for Vite):');
  log('dev-all', `VITE_CONVEX_URL=${process.env.VITE_CONVEX_URL}`);
  log('dev-all', `VITE_CONVEX_SITE_URL=${process.env.VITE_CONVEX_SITE_URL}`);
}

async function bootstrapConvexBackend(proxied) {
  if (proxied) {
    log('dev-all', 'Waiting for Convex to write loopback VITE_CONVEX_URL...');
    if (!(await waitForConvexLoopbackEnv())) {
      log('dev-all', 'WARN: Loopback Convex URL not ready; backend proxy may use defaults.');
    }
    prepareProxiedViteEnv();
  }

  log('dev-all', 'Waiting for Convex backend...');
  if (!(await waitForConvexBackendPort())) {
    log(
      'dev-all',
      proxied
        ? 'WARN: Timed out waiting for Convex backend; WS proxy may fail briefly.'
        : 'WARN: Timed out waiting for Convex backend; app requests may fail briefly.'
    );
    return;
  }

  seedDevPreviewFixtures();
}

function startResendEmulate() {
  log('dev-all', 'Starting Resend emulate...');
  const emulate = spawnShellBackground('node script/run.mjs emulate-resend');
  trackedChildren.push(emulate);
}

function startGoogleEmulateIfNeeded() {
  if (shouldStartGoogleEmulate()) {
    log('dev-all', 'Starting Google emulate...');
    const emulate = spawnShellBackground('node script/run.mjs emulate');
    trackedChildren.push(emulate);
    void waitForEmulatePort().then((ready) => {
      if (!ready) {
        log('dev-all', 'WARN: Google emulate may not be ready; sign-in may fail briefly.');
      }
    });
    return;
  }

  if (usesGoogleOAuthCredentials()) {
    log('dev-all', 'AUTH_GOOGLE_ID is set — skipping Google emulate.');
  } else {
    log('dev-all', 'E2E programmatic auth — skipping Google emulate.');
  }
}

const LOCAL_BACKEND_VERSION_RE = /^precompiled-\d{4}-\d{2}-\d{2}-[0-9a-f]+$/;

/**
 * Stay on the backend version already recorded for this checkout.
 * `pnpm run dev:backend` force-upgrades by snapshotting the database first.
 * A snapshot left in progress blocks every later startup, so `dev:all` does
 * not take that path. Upgrade explicitly with `npx convex dev`.
 */
function localDevBackendCommand() {
  const configPath = join(ROOT_DIR, '.convex', 'local', 'default', 'config.json');
  if (!existsSync(configPath)) {
    return 'pnpm run dev:backend';
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const version = config.backendVersion;
    if (typeof version === 'string' && LOCAL_BACKEND_VERSION_RE.test(version)) {
      log('dev-all', `Using existing local backend ${version}.`);
      return `npx convex dev --local-backend-version ${version}`;
    }
  } catch {
    // Missing or unreadable config: fall back to the force-upgrade script.
  }
  return 'pnpm run dev:backend';
}

async function runDev() {
  process.on('SIGINT', () => {
    cleanupChildren();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanupChildren();
    process.exit(143);
  });

  if (!readEnvLocalVar('VITE_CONVEX_URL')) {
    log('dev-all', 'First-time setup detected. Running setup...');
    await runSetup('local');
  }

  process.env.CONVEX_TMPDIR = join(homedir(), '.cache/convex/tmp');
  mkdirSync(process.env.CONVEX_TMPDIR, { recursive: true });

  await cleanupStaleDevPorts();

  const proxied = isProxiedLocalConvex();
  const remoteDev = isRemoteDevHost();
  if (process.env.RESET_CONVEX_DASHBOARD_CACHE === '1') {
    log('dev-all', 'Clearing Convex dashboard cache...');
    rmSync(join(homedir(), '.cache/convex/dashboard'), { recursive: true, force: true });
  }

  // Railway caps the container at 3 GB. On a fresh PR environment the seed, the
  // Convex backend, `tsc` and Vite's esbuild dep pre-bundle all peak together;
  // past the cap the kernel kills esbuild, Vite exits and the deploy crashes.
  // Skip the Convex typecheck (CI covers it) and keep esbuild's Go heap small.
  if (remoteDev) {
    process.env.GOMEMLIMIT ??= '512MiB';
  }

  log('dev-all', 'Starting Convex and Vite...');

  const backend = spawnShellBackground(
    remoteDev ? 'pnpm run dev:backend:remote' : localDevBackendCommand(),
    {
      env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
    }
  );
  trackedChildren.push(backend);

  if (proxied) {
    prepareProxiedViteEnv();
  }

  // Bind $PORT early so Railway health checks succeed while Convex bootstraps.
  if (remoteDev) {
    log('dev-all', 'Remote dev — starting Vite before Convex bootstrap completes.');
    const vite = spawnShellBackground('pnpm run dev');
    trackedChildren.push(vite);
    void bootstrapConvexBackend(proxied);
    void waitForDashboardAsync();
    startResendEmulate();
    startGoogleEmulateIfNeeded();
  } else {
    await bootstrapConvexBackend(proxied);
    void waitForDashboardAsync();
    startResendEmulate();
    startGoogleEmulateIfNeeded();

    const vite = spawnShellBackground('pnpm run dev');
    trackedChildren.push(vite);
  }

  await monitorPids(
    trackedChildren.map((c) => c.pid).filter((pid) => pid !== undefined),
    {
      onExit: () => {
        cleanupChildren();
        process.exit(1);
      },
    }
  );
}

function normalizeUrl(value) {
  return value?.trim().replace(/\/+$/, '');
}

function expandLocalAliases(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return [];
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    return [normalized];
  }

  if (url.hostname === 'localhost') {
    const localhostUrl = url.toString().replace(/\/$/, '');
    url.hostname = '127.0.0.1';
    return [localhostUrl, url.toString().replace(/\/$/, '')];
  }

  if (url.hostname === '127.0.0.1') {
    const loopbackUrl = url.toString().replace(/\/$/, '');
    url.hostname = 'localhost';
    return [loopbackUrl, url.toString().replace(/\/$/, '')];
  }

  return [normalized];
}

let loggedFetchConvexUsersFailure = false;
let loggedEmulateFallbackUsers = false;

function fetchConvexUsers() {
  try {
    const result = spawnSync('npx', ['convex', 'run', 'users:listAll', '--no-push'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 15000,
      shell: process.platform === 'win32',
    });
    if (result.status !== 0 || !result.stdout) {
      if (!loggedFetchConvexUsersFailure) {
        loggedFetchConvexUsersFailure = true;
        const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
        console.warn(
          `WARN: users:listAll failed; Google emulate will use fallback personas until Convex is ready.${detail ? ` ${detail}` : ''}`
        );
      }
      return [];
    }
    const parsed = JSON.parse(result.stdout.trim());
    if (Array.isArray(parsed)) {
      loggedFetchConvexUsersFailure = false;
      return parsed.filter((u) => u && typeof u.email === 'string');
    }
    return [];
  } catch (error) {
    if (!loggedFetchConvexUsersFailure) {
      loggedFetchConvexUsersFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `WARN: users:listAll failed; Google emulate will use fallback personas until Convex is ready. ${message}`
      );
    }
    return [];
  }
}

function resolveEmulateUsers(dbUsers) {
  if (!Array.isArray(dbUsers) || dbUsers.length === 0) {
    if (!loggedEmulateFallbackUsers) {
      loggedEmulateFallbackUsers = true;
      console.log('No Convex DB users found (or Convex not reachable), using fallback admin only.');
    }
    return mergeEmulateUsers(FIRST_SETUP_EMULATE_USERS);
  }
  loggedEmulateFallbackUsers = false;
  return mergeEmulateUsers(dbUsers);
}

function userSetKey(users) {
  return users
    .map((u) => u.email)
    .toSorted()
    .join('\n');
}

async function runEmulate() {
  const baseConfigPath = join(ROOT_DIR, 'emulate.config.yaml');
  const fileEnv = {
    ...readEnvFile(join(ROOT_DIR, '.env')),
    ...readEnvFile(join(ROOT_DIR, '.env.local')),
  };

  const baseConfig = existsSync(baseConfigPath)
    ? (YAML.parse(readFileSync(baseConfigPath, 'utf8')) ?? {})
    : {};

  const publicAppBase = getPublicAppBase();
  const proxiedConvexSiteUrl = isPublicProxyHost(publicAppBase) ? getProxiedConvexSiteUrl() : null;
  const localBackendTargets = readLocalConvexBackendTargets({
    env: { ...process.env, ...fileEnv },
  });

  const baseUrls = [
    process.env.CUSTOM_AUTH_SITE_URL,
    process.env.CONVEX_SITE_URL,
    process.env.VITE_CONVEX_BACKEND_SITE_URL,
    process.env.VITE_CONVEX_SITE_URL,
    fileEnv.CUSTOM_AUTH_SITE_URL,
    fileEnv.CONVEX_SITE_URL,
    fileEnv.VITE_CONVEX_BACKEND_SITE_URL,
    fileEnv.VITE_CONVEX_SITE_URL,
    proxiedConvexSiteUrl,
    localBackendTargets.site,
    localBackendTargets.api,
  ]
    .flatMap(expandLocalAliases)
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  const redirectUris = baseUrls.map((baseUrl) => `${baseUrl}/api/auth/callback/google`);

  function buildRuntimeConfig(users) {
    return {
      ...baseConfig,
      google: {
        ...baseConfig.google,
        users,
        oauth_clients: (baseConfig.google?.oauth_clients?.length
          ? baseConfig.google.oauth_clients
          : [
              {
                client_id: 'emulate-google-client-id',
                client_secret: 'emulate-google-client-secret',
              },
            ]
        ).map((client) => ({
          ...client,
          redirect_uris: Array.from(new Set([...(client.redirect_uris ?? []), ...redirectUris])),
        })),
      },
    };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'emulate-'));
  const runtimeConfigPath = join(tempDir, 'emulate.config.yaml');

  function writeRuntimeSeed(users) {
    writeFileSync(runtimeConfigPath, YAML.stringify(buildRuntimeConfig(users)));
  }

  console.log('Fetching users from Convex DB...');
  const initialDbUsers = fetchConvexUsers();
  let currentUsers = resolveEmulateUsers(initialDbUsers);
  if (initialDbUsers.length > 0) {
    console.log(`Found ${initialDbUsers.length} user(s) in Convex DB.`);
  }
  writeRuntimeSeed(currentUsers);

  let lastUserSetKey = userSetKey(currentUsers);
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null;
  let shuttingDown = false;

  function startEmulator() {
    child = spawn(
      'npx',
      ['emulate', 'start', '--service', 'google', '--port', '4002', '--seed', runtimeConfigPath],
      {
        cwd: ROOT_DIR,
        env: process.env,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      }
    );

    child.on('exit', (code) => {
      if (shuttingDown) {
        return;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      process.exit(code ?? 1);
    });
  }

  function restartEmulator(users) {
    console.log(
      `Convex user set changed (${users.length} user(s)); restarting Google emulate with updated seed.`
    );
    writeRuntimeSeed(users);
    lastUserSetKey = userSetKey(users);
    currentUsers = users;

    if (!child) {
      startEmulator();
      return;
    }

    shuttingDown = true;
    const oldChild = child;
    oldChild.once('exit', () => {
      shuttingDown = false;
      startEmulator();
    });
    oldChild.kill('SIGTERM');
  }

  function pollConvexUsers() {
    const dbUsers = fetchConvexUsers();
    if (dbUsers.length === 0) {
      return;
    }
    const nextUsers = resolveEmulateUsers(dbUsers);
    const nextKey = userSetKey(nextUsers);
    if (nextKey !== lastUserSetKey) {
      restartEmulator(nextUsers);
    }
  }

  console.log('Starting Google emulate on http://localhost:4002');
  console.log(`Using redirect URIs:\n${redirectUris.map((uri) => `- ${uri}`).join('\n')}`);

  startEmulator();
  pollTimer = setInterval(pollConvexUsers, POLL_INTERVAL_MS);

  const shutdown = () => {
    shuttingDown = true;
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    if (child) {
      child.kill('SIGTERM');
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function runResendEmulate() {
  console.log('Starting Resend emulate on http://localhost:4003');
  const child = spawn('npx', ['emulate', 'start', '--service', 'resend', '--port', '4003'], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const shutdown = () => {
    child.kill('SIGTERM');
  };

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function assertNoCloudConvexEnv() {
  const forbidden = [];
  if (process.env.CONVEX_DEPLOY_KEY) forbidden.push('CONVEX_DEPLOY_KEY');
  if (process.env.VITE_CONVEX_URL) forbidden.push('VITE_CONVEX_URL');
  if (process.env.VITE_CONVEX_SITE_URL) forbidden.push('VITE_CONVEX_SITE_URL');
  if (process.env.AUTH_GOOGLE_ID) forbidden.push('AUTH_GOOGLE_ID');
  if (process.env.AUTH_GOOGLE_SECRET) forbidden.push('AUTH_GOOGLE_SECRET');
  if (process.env.PUBLIC_APP_URL) forbidden.push('PUBLIC_APP_URL');

  if (forbidden.length > 0) {
    log(
      'railway-pr',
      'ERROR: local/PR preview must not inherit cloud Convex or staging auth vars.'
    );
    log(
      'railway-pr',
      `Unset on Railway env "local" and set PR preview base env to "local": ${forbidden.join(' ')}`
    );
    process.exit(1);
  }
}

async function runRailway(subcommand) {
  switch (subcommand) {
    case 'build': {
      assertNoCloudConvexEnv();
      log('railway-pr', 'Local Convex — codegen only');
      ensureConvexCodegenAuthEnv();
      const convexTmpDir = join(homedir(), '.cache/convex/tmp');
      mkdirSync(convexTmpDir, { recursive: true });
      const convexBuildEnv = {
        ...process.env,
        CI: 'true',
        CONVEX_AGENT_MODE: 'anonymous',
        CONVEX_TMPDIR: convexTmpDir,
        NODE_OPTIONS: '--dns-result-order=ipv4first',
      };
      if (!existsSync(join(homedir(), '.cache/convex/binaries'))) {
        log(
          'railway-pr',
          'Convex local binary cache miss — prefetching (this can take a few minutes)...'
        );
      } else {
        log('railway-pr', 'Ensuring Convex local binary is present (prefetch is idempotent)...');
      }
      execSync('pnpm run prefetch:convex:local', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: convexBuildEnv,
        timeout: 600_000,
      });
      Object.assign(process.env, {
        CI: 'true',
        CONVEX_AGENT_MODE: 'anonymous',
        CONVEX_TMPDIR: convexTmpDir,
        NODE_OPTIONS: '--dns-result-order=ipv4first',
      });
      await pushLocalConvexWithEnv('railway-pr', { env: convexBuildEnv });
      log('railway-pr', 'Convex codegen complete');
      break;
    }
    case 'predeploy':
      log('railway-pr', 'Local Convex — skipping convex deploy');
      break;
    case 'start': {
      assertNoCloudConvexEnv();
      await runSetup('pr');
      await ensurePrBrandingEnv();
      await runDev();
      break;
    }
    case 'serve': {
      log(
        'railway',
        'Staging/production mode — serving static build (Convex deploy runs in pre-deploy).'
      );
      if (!usesGoogleOAuthCredentials()) {
        log('railway', 'AUTH_GOOGLE_ID not set — starting Google emulate for staging.');
        const emulate = spawnShellBackground('node script/run.mjs emulate');
        process.on('exit', () => {
          try {
            emulate.kill('SIGTERM');
          } catch {
            // ignore
          }
        });
      }
      // Resend emulate is local/PR only (`dev` / `railway start`). Staging and
      // production Convex send mail to api.resend.com (RESEND_BASE_URL unset).
      log('railway', 'Skipping Resend emulate — staging/production use real Resend.');
      execSync('pnpm run start:deploy', { cwd: ROOT_DIR, stdio: 'inherit' });
      break;
    }
    default:
      log('run', 'Usage: node script/run.mjs railway {build|predeploy|start|serve}');
      process.exit(1);
  }
}

async function main() {
  if (relaunchWithPinnedNode()) {
    return;
  }
  const [command, subcommand] = process.argv.slice(2);

  switch (command) {
    case 'dev':
      await runDev();
      break;
    case 'emulate':
      await runEmulate();
      break;
    case 'emulate-resend':
      runResendEmulate();
      break;
    case 'railway':
      await runRailway(subcommand);
      break;
    default:
      log('run', 'Usage: node script/run.mjs {dev|emulate|emulate-resend|railway} ...');
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
