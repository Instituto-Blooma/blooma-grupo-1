import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveConvexUrl, requireE2eAuthSecret } from './env-file.mjs';
import { shouldStartGoogleEmulate } from './auth-mode.mjs';
import { mintTestLoginTokens } from '../cypress/tasks/mintTestLoginTokens.mjs';
import { verifyAuthSession } from '../cypress/tasks/verifyAuthSession.mjs';
import {
  cleanupStaleDevPorts,
  getDevServerPort,
  restoreDevConvexEnv,
  waitForConvexBackendPort,
  waitForConvexFunction,
} from './env-urls.mjs';
import {
  clearPidFile,
  E2E_STACK_CHILDREN_FILE,
  E2E_STACK_LOG_DIR,
  killPidsFromFile,
  log,
  monitorPids,
  readE2eContext,
  readPidsFromFile,
  recordChildPid,
  ROOT_DIR,
  spawnPnpmDetached,
  spawnShellBackground,
} from './lib.mjs';
import { seedE2eFixtures } from './seed.mjs';

const MAX_READY_ATTEMPTS = 60;
const READY_RETRY_MS = 2000;
const VITE_PORT = getDevServerPort();
const VITE_URL = process.env.E2E_VITE_URL ?? `http://localhost:${VITE_PORT}`;
const ADMIN_EMAIL = 'dev@example.com';

function cypressEnv() {
  const env = { ...process.env };
  // Cursor and some Electron-based shells export this for their own runtime.
  // Cypress needs Electron to receive its normal CLI flags instead.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function injectE2eEnv() {
  process.env.E2E = '1';
  process.env.CONVEX_AGENT_MODE = 'anonymous';
  requireE2eAuthSecret();
}

function normalizeCypressArgs(args) {
  let normalized = args.filter((arg) => arg !== '--');
  const specEnv = process.env.CYPRESS_SPEC;
  if (specEnv && !normalized.includes('--spec')) {
    normalized = ['--spec', specEnv, ...normalized];
  }
  return normalized;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkConvexVersion(convexUrl) {
  const response = await fetch(`${convexUrl.replace(/\/$/, '')}/version`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`Convex /version returned ${response.status}`);
  }
}

async function checkViteShell() {
  const response = await fetch(VITE_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Vite ${VITE_URL} returned ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes('root') && !html.includes('id="root"')) {
    throw new Error('Vite shell missing root mount');
  }
}

function checkContextFile() {
  const ctx = readE2eContext();
  if (!ctx) {
    throw new Error('Missing cypress/fixtures/e2e-context.json');
  }
  if (!ctx.orgBId) {
    throw new Error('e2e-context.json missing orgBId');
  }
  if (!ctx.sessionEpoch) {
    throw new Error('e2e-context.json missing sessionEpoch');
  }
  return ctx;
}

async function runStage(name, fn) {
  await fn();
  log('wait-e2e-ready', `OK: ${name}`);
}

async function waitForE2eReady() {
  const convexUrl = resolveConvexUrl();
  const secret = requireE2eAuthSecret();

  if (!convexUrl) {
    log('wait-e2e-ready', 'VITE_CONVEX_URL is not set');
    process.exit(1);
  }

  let lastError = 'unknown';

  for (let attempt = 1; attempt <= MAX_READY_ATTEMPTS; attempt += 1) {
    try {
      await runStage('convex-version', () => checkConvexVersion(convexUrl));
      await runStage('vite-shell', () => checkViteShell());
      await runStage('e2e-context', async () => {
        checkContextFile();
      });
      await runStage('mint-smoke', async () => {
        const tokens = await mintTestLoginTokens({ convexUrl, secret, email: ADMIN_EMAIL });
        await verifyAuthSession({ token: tokens.token, expectedEmail: ADMIN_EMAIL });
      });
      log('wait-e2e-ready', 'All checks passed');
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_READY_ATTEMPTS) {
        log(
          'wait-e2e-ready',
          `Attempt ${attempt}/${MAX_READY_ATTEMPTS} failed (${lastError}) — retrying...`
        );
        await sleep(READY_RETRY_MS);
      }
    }
  }

  log('wait-e2e-ready', `Timed out — last error: ${lastError}`);
  process.exit(1);
}

async function startStackServices() {
  clearPidFile();
  mkdirSync(E2E_STACK_LOG_DIR, { recursive: true });

  injectE2eEnv();
  process.env.CONVEX_TMPDIR = join(homedir(), '.cache/convex/tmp');
  mkdirSync(process.env.CONVEX_TMPDIR, { recursive: true });

  log('e2e-stack', `Starting local Convex (log: ${E2E_STACK_LOG_DIR}/convex.log)...`);
  const convexChild = spawnPnpmDetached('dev:backend', {
    logFile: join(E2E_STACK_LOG_DIR, 'convex.log'),
    env: { ...process.env, CONVEX_AGENT_MODE: 'anonymous' },
  });
  recordChildPid(convexChild.pid);

  log('e2e-stack', 'Waiting for Convex backend...');
  if (!(await waitForConvexBackendPort())) {
    log('e2e-stack', 'Timed out waiting for Convex backend');
    process.exit(1);
  }

  log('e2e-stack', 'Waiting for users:current after Convex push...');
  if (!(await waitForConvexFunction('users:current'))) {
    log('e2e-stack', 'Timed out waiting for users:current');
    process.exit(1);
  }

  log('e2e-stack', 'Seeding E2E fixtures...');
  await seedE2eFixtures();

  log('e2e-stack', 'Starting emulators...');
  if (shouldStartGoogleEmulate(process.env, { forE2eStack: true })) {
    const googleEmulate = spawnPnpmDetached('dev:emulate', {
      logFile: join(E2E_STACK_LOG_DIR, 'google-emulate.log'),
    });
    recordChildPid(googleEmulate.pid);
  }
  const resendEmulate = spawnShellBackground('node script/run.mjs emulate-resend', {
    logFile: join(E2E_STACK_LOG_DIR, 'resend-emulate.log'),
    detach: true,
  });
  recordChildPid(resendEmulate.pid);

  log('e2e-stack', `Starting Vite (log: ${E2E_STACK_LOG_DIR}/vite.log)...`);
  const viteChild = spawnPnpmDetached('dev', {
    logFile: join(E2E_STACK_LOG_DIR, 'vite.log'),
  });
  recordChildPid(viteChild.pid);

  log('e2e-stack', 'Waiting for E2E readiness (mint smoke gate)...');
  await waitForE2eReady();
}

async function stackUp({ monitor = false } = {}) {
  if (!existsSync(join(ROOT_DIR, '.env.local'))) {
    log('e2e-stack', 'Missing .env.local — run pnpm run setup first');
    process.exit(1);
  }

  requireE2eAuthSecret();
  await cleanupStaleDevPorts();
  await startStackServices();

  log(
    'e2e-stack',
    `Stack ready (PIDs in ${E2E_STACK_CHILDREN_FILE}, logs in ${E2E_STACK_LOG_DIR}/)`
  );

  if (monitor) {
    log('e2e-stack', `Ready — logs in ${E2E_STACK_LOG_DIR}/, press Ctrl+C to stop`);
    const pids = readPidsFromFile();
    await monitorPids(pids, {
      onExit: async (pid) => {
        log('e2e-stack', `Process ${pid} exited — shutting down stack`);
        await killPidsFromFile();
        process.exit(1);
      },
    });
  }
}

async function stackDown() {
  process.on('SIGTERM', () => {});
  process.on('SIGINT', () => {});
  await killPidsFromFile();
  await restoreDevConvexEnv().catch(() => {});
  log('e2e-stack:down', 'Stopped E2E stack processes');
}

async function stackRun(cypressArgs) {
  const cypressBin = join(ROOT_DIR, 'node_modules/.bin/cypress');
  if (!existsSync(cypressBin)) {
    log('e2e-run', 'Missing Cypress — run pnpm install && pnpm exec cypress install');
    process.exit(1);
  }

  let stackStarted = false;
  let exitCode = 0;

  const cleanup = async () => {
    if (stackStarted) {
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
      process.on('SIGTERM', () => {});
      process.on('SIGINT', () => {});
      await killPidsFromFile().catch(() => {});
      await restoreDevConvexEnv().catch(() => {});
      stackStarted = false;
    }
  };

  process.on('SIGTERM', () => {
    void cleanup().then(() => process.exit(1));
  });
  process.on('SIGINT', () => {
    void cleanup().then(() => process.exit(130));
  });

  try {
    await stackUp();
    stackStarted = true;

    try {
      const normalizedArgs = normalizeCypressArgs(cypressArgs);
      if (process.env.E2E_DEBUG === '1') {
        log('e2e-run', `Cypress: run ${normalizedArgs.join(' ')}`);
      }
      const result = spawnSync(cypressBin, ['run', ...normalizedArgs], {
        cwd: ROOT_DIR,
        env: cypressEnv(),
        stdio: 'inherit',
      });
      exitCode = result.status ?? 1;
    } catch (error) {
      exitCode = /** @type {{ status?: number }} */ (error).status ?? 1;
    }
  } finally {
    await cleanup();
  }

  process.exit(exitCode);
}

async function e2eSetup() {
  if (!existsSync(join(ROOT_DIR, '.env.local'))) {
    log('e2e-setup', 'Missing .env.local — run pnpm run setup first');
    process.exit(1);
  }

  injectE2eEnv();
  await seedE2eFixtures();

  const cypressBin = join(ROOT_DIR, 'node_modules/.bin/cypress');
  if (!existsSync(cypressBin)) {
    log('e2e-setup', 'Missing Cypress package — run pnpm install first');
    process.exit(1);
  }

  try {
    const versionOutput = execSync(`"${cypressBin}" version`, { encoding: 'utf8' });
    if (!/Cypress binary version: [0-9]/.test(versionOutput)) {
      throw new Error('binary missing');
    }
  } catch {
    log('e2e-setup', 'Installing Cypress binary...');
    execSync(`"${cypressBin}" install`, { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  log('e2e-setup', 'Done');
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'up':
      await stackUp();
      process.exit(0);
      break;
    case 'monitor':
      await stackUp({ monitor: true });
      break;
    case 'down':
      await stackDown();
      break;
    case 'run':
      await stackRun(rest);
      break;
    case 'setup':
      await e2eSetup();
      break;
    default:
      log('e2e', `Usage: node script/e2e.mjs {up|down|run|setup|monitor} [cypress args...]`);
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
