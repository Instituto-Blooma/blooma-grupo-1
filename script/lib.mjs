import { execSync, spawn } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPair } from 'node:crypto';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const generateKeyPairAsync = promisify(generateKeyPair);

export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const E2E_CONTEXT_PATH = join(ROOT_DIR, 'cypress', 'fixtures', 'e2e-context.json');
export const SETUP_SENTINEL_FILE = join(ROOT_DIR, '.setup-done');
export const SETUP_LOCK_DIR = join(ROOT_DIR, '.setup-lock');
export const E2E_STACK_CHILDREN_FILE = join(ROOT_DIR, '.e2e-stack-children.pids');
export const E2E_STACK_LOG_DIR = join(ROOT_DIR, '.e2e-stack-logs');

export function log(tag, message) {
  console.error(`[${tag}] ${message}`);
}

export function runConvex(command, { logLabel, cwd = ROOT_DIR } = {}) {
  if (logLabel) {
    log('convex', logLabel);
  }
  return execSync(command, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function pipeToLogFile(child, logFile) {
  mkdirSync(dirname(logFile), { recursive: true });
  const logStream = createWriteStream(logFile, { flags: 'a' });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
}

export function spawnDetached(command, args, { logFile, env = process.env, cwd = ROOT_DIR } = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: logFile ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    detached: false,
  });

  if (logFile) {
    pipeToLogFile(child, logFile);
  }

  return child;
}

export function spawnShellBackground(
  shellCommand,
  { logFile, env = process.env, cwd = ROOT_DIR, detach = false } = {}
) {
  // `exec` is a POSIX shell builtin; cmd.exe has no equivalent, so Windows just redirects.
  const execPrefix = process.platform === 'win32' ? '' : 'exec ';
  const command =
    detach && logFile
      ? `${execPrefix}${shellCommand} >> ${JSON.stringify(logFile)} 2>&1`
      : shellCommand;

  const child = spawn(command, {
    cwd,
    env,
    shell: true,
    detached: detach,
    stdio: detach ? 'ignore' : logFile ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (logFile && !detach) {
    pipeToLogFile(child, logFile);
  }

  if (detach) {
    child.unref();
  }

  return child;
}

function resolvePnpmJsEntry() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js'),
  ];
  const entry = candidates.find(
    (candidate) => candidate && /pnpm[^\\/]*\.c?js$/i.test(candidate) && existsSync(candidate)
  );
  if (!entry) {
    throw new Error('Could not locate pnpm JS entry; run `corepack enable` and retry.');
  }
  return entry;
}

/** Detached pnpm run for E2E stack — parent can exit; child survives without a shell wrapper. */
export function spawnPnpmDetached(scriptName, { logFile, env = process.env, cwd = ROOT_DIR } = {}) {
  if (!logFile) {
    throw new Error('spawnPnpmDetached requires logFile');
  }
  mkdirSync(dirname(logFile), { recursive: true });
  const logFd = openSync(logFile, 'a');
  // Windows cannot spawn pnpm.cmd without a shell, and a detached cmd.exe drops the log
  // handles (the child then dies on its first write). Run pnpm's JS entry with node instead.
  const pnpmJs = process.platform === 'win32' ? resolvePnpmJsEntry() : null;
  const [command, args] = pnpmJs
    ? [process.execPath, [pnpmJs, 'run', scriptName]]
    : ['pnpm', ['run', scriptName]];
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  closeSync(logFd);
  child.unref();
  return child;
}

export function recordChildPid(pid, pidFile = E2E_STACK_CHILDREN_FILE) {
  writeFileSync(pidFile, `${existsSync(pidFile) ? readFileSync(pidFile, 'utf8') : ''}${pid}\n`, {
    flag: 'a',
  });
}

export function clearPidFile(pidFile = E2E_STACK_CHILDREN_FILE) {
  writeFileSync(pidFile, '');
}

export function readPidsFromFile(pidFile) {
  if (!existsSync(pidFile)) {
    return [];
  }
  return readFileSync(pidFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((pid) => Number(pid))
    .filter((pid) => !Number.isNaN(pid));
}

export async function killPidsFromFile(pidFile = E2E_STACK_CHILDREN_FILE) {
  const pids = readPidsFromFile(pidFile);
  if (pids.length === 0) {
    return;
  }

  const selfPid = process.pid;
  const parentPid = process.ppid;

  if (process.platform === 'win32') {
    // process.kill only ends the cmd.exe wrapper on Windows; taskkill /T ends its whole tree.
    for (const pid of pids) {
      if (pid === selfPid || pid === parentPid) {
        continue;
      }
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } catch {
        // already gone
      }
    }
    rmSync(pidFile, { force: true });
    return;
  }

  for (const pid of pids) {
    if (pid === selfPid || pid === parentPid) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }

  await sleep(1000);

  for (const pid of pids) {
    if (pid === selfPid || pid === parentPid) {
      continue;
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }

  rmSync(pidFile, { force: true });
}

export async function waitUntil(
  checkFn,
  { maxAttempts = 60, retryMs = 1000, label = 'condition' } = {}
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await checkFn()) {
      return true;
    }
    await sleep(retryMs);
  }
  log('wait', `Timed out waiting for ${label}`);
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireSetupLock(tag = 'setup') {
  while (true) {
    try {
      mkdirSync(SETUP_LOCK_DIR);
      return () => releaseSetupLock();
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') {
        throw error;
      }
      log(tag, 'Another setup process is already running. Waiting for it to finish.');
      await sleep(2000);
    }
  }
}

export function releaseSetupLock() {
  try {
    rmSync(SETUP_LOCK_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

export function readE2eContext() {
  if (!existsSync(E2E_CONTEXT_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(E2E_CONTEXT_PATH, 'utf8'));
}

export function writeE2eContext(context) {
  mkdirSync(dirname(E2E_CONTEXT_PATH), { recursive: true });
  writeFileSync(E2E_CONTEXT_PATH, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
}

/** RFC 7638 thumbprint; matches jose `calculateJwkThumbprint` for RSA. */
export function rfc7638RsaKid(jwk) {
  if (typeof jwk?.kid === 'string' && jwk.kid.length > 0) {
    return jwk.kid;
  }
  return createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
    .digest('base64url');
}

/**
 * Convex Auth historically stored JWKS keys without `kid`. customJwt lookup
 * requires it, so setup stamps the thumbprint onto existing keys (no rotation).
 */
export function stampJwksKids(jwksJson) {
  const parsed = JSON.parse(jwksJson);
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.keys)) {
    throw new Error('JWKS is missing keys');
  }
  let changed = false;
  const keys = parsed.keys.map((key) => {
    if (typeof key !== 'object' || key === null) {
      return key;
    }
    if (typeof key.kid === 'string' && key.kid.length > 0) {
      return key;
    }
    changed = true;
    return { ...key, kid: rfc7638RsaKid(key) };
  });
  return { json: JSON.stringify({ ...parsed, keys }), changed };
}

export async function generateConvexAuthKeys() {
  const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
  return {
    JWT_PRIVATE_KEY: privateKey.trimEnd().replace(/\n/g, ' '),
    JWKS: JSON.stringify({ keys: [{ use: 'sig', kid: rfc7638RsaKid(jwk), ...jwk }] }),
  };
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function monitorPids(pids, { onExit, pollMs = 1000 } = {}) {
  while (true) {
    for (const pid of pids) {
      if (!isProcessAlive(pid)) {
        await onExit?.(pid);
        return pid;
      }
    }
    await sleep(pollMs);
  }
}
