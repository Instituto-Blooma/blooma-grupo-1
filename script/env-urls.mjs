import { execSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { convexEnvHas, readConvexEnv, setConvexEnvVar, unsetConvexEnvVar } from './convex-env.mjs';
import {
  DEFAULT_ENV_LOCAL_PATH,
  parseEnvFile,
  readEnvLocalVar,
  requireE2eAuthSecret,
  writeEnvLocalVar,
} from './env-file.mjs';

const DEFAULT_CONVEX_API_URL = 'http://127.0.0.1:3210';
const DEFAULT_CONVEX_SITE_URL = 'http://127.0.0.1:3211';

function isLoopbackUrl(value) {
  if (!value) {
    return false;
  }
  try {
    const { hostname } = new URL(value);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function pickLoopbackTargets(vars) {
  const backendApi = vars.VITE_CONVEX_BACKEND_URL?.trim();
  const backendSite = vars.VITE_CONVEX_BACKEND_SITE_URL?.trim();
  if (backendApi && isLoopbackUrl(backendApi)) {
    return {
      api: backendApi.replace(/\/+$/, ''),
      site: (backendSite && isLoopbackUrl(backendSite)
        ? backendSite
        : DEFAULT_CONVEX_SITE_URL
      ).replace(/\/+$/, ''),
    };
  }

  const api = vars.VITE_CONVEX_URL?.trim();
  const site = vars.VITE_CONVEX_SITE_URL?.trim();
  if (api && isLoopbackUrl(api)) {
    return {
      api: api.replace(/\/+$/, ''),
      site: (site && isLoopbackUrl(site) ? site : DEFAULT_CONVEX_SITE_URL).replace(/\/+$/, ''),
    };
  }

  return null;
}

/** Loopback Convex URLs for Vite proxy targets (not browser-facing). */
export function readLocalConvexBackendTargets(options = {}) {
  const env = options.env ?? process.env;
  const envLocalPath = options.envLocalPath ?? path.resolve(process.cwd(), '.env.local');

  const fromProcess = pickLoopbackTargets(env);
  if (fromProcess) {
    return fromProcess;
  }

  let fileEnv = {};
  try {
    fileEnv = parseEnvFile(fs.readFileSync(envLocalPath, 'utf8'));
  } catch {
    // .env.local is gitignored and may not exist at build time
  }

  const fromFile = pickLoopbackTargets(fileEnv);
  if (fromFile) {
    return fromFile;
  }

  return {
    api: DEFAULT_CONVEX_API_URL,
    site: DEFAULT_CONVEX_SITE_URL,
  };
}

export function getPublicAppBase(env = process.env) {
  const explicit = env.PUBLIC_APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }

  return `http://localhost:${getDevServerPort(env)}`;
}

export function isPublicProxyHost(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

export function isLocalConvexDeployment(envLocalContents) {
  return /^CONVEX_DEPLOYMENT=(local|anonymous):/m.test(envLocalContents);
}

export function isRemoteDevHost(env = process.env) {
  return isPublicProxyHost(getPublicAppBase(env));
}

export function getAllowedHosts(env = process.env) {
  const hosts = [];
  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();

  if (railwayDomain) {
    hosts.push(railwayDomain);
  }

  hosts.push('.railway.app');
  return [...new Set(hosts.filter(Boolean))];
}

export function getDevServerPort(env = process.env) {
  const port = env.PORT?.trim();
  if (port) {
    const parsed = Number.parseInt(port, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 5173;
}

export function getProxiedConvexUrl(env = process.env) {
  return `${getPublicAppBase(env)}/_convex`;
}

export function getProxiedConvexSiteUrl(env = process.env) {
  return `${getPublicAppBase(env)}/_convex_site`;
}

/**
 * RFC 8414 / 9728 path-insertion on the public app origin includes `/_convex_site`.
 * Strip that prefix so Vite can proxy the remainder to Convex HTTP.
 */
export function rewriteWellKnownConvexProxyPath(pathname) {
  return pathname.replace(/\/_convex_site(?=\/|$)/, '');
}

/**
 * Local dashboard `/api/current_deployment` returns a loopback backend URL.
 * The proxied dashboard must call `/_convex` on the app host instead.
 */
export function rewriteDashboardCurrentDeploymentBody(raw, publicConvexUrl) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.url !== 'string') {
    return raw;
  }
  return JSON.stringify({ ...parsed, url: publicConvexUrl });
}

export function getEmulatePublicUrl(env = process.env) {
  const base = getPublicAppBase(env);
  if (isPublicProxyHost(base)) {
    return `${base}/google-emulate`;
  }
  return 'http://localhost:4002';
}

export function getResendEmulatePublicUrl(env = process.env) {
  const base = getPublicAppBase(env);
  if (isPublicProxyHost(base)) {
    return `${base}/resend-emulate`;
  }
  return 'http://localhost:4003';
}

/** Deployment slug from CONVEX_DEPLOYMENT (part after the last colon). */
export function readConvexDeploymentName(options = {}) {
  const envLocalPath = options.envLocalPath ?? path.resolve(process.cwd(), '.env.local');

  let contents = options.envLocalContents;
  if (contents === undefined) {
    try {
      contents = fs.readFileSync(envLocalPath, 'utf8');
    } catch {
      return '';
    }
  }

  const match = contents.match(/^CONVEX_DEPLOYMENT=(.+)$/m);
  if (!match) {
    return '';
  }

  const raw = match[1].trim();
  return raw.includes(':') ? raw.split(':').slice(-1)[0] : raw;
}

/**
 * Ensure the Convex dashboard ?d= deployment param is present on a proxied path.
 * pathnameAndQuery is the path after stripping /_dashboard (e.g. "/" or "/favicon.ico?foo=1").
 */
export function ensureDashboardDeploymentQuery(pathnameAndQuery, deploymentName) {
  if (!deploymentName) {
    return pathnameAndQuery || '/';
  }

  const raw = pathnameAndQuery || '/';
  const queryIndex = raw.indexOf('?');
  const pathname = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);

  const params = new URLSearchParams(query);
  params.set('d', deploymentName);
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : `${pathname}?d=${deploymentName}`;
}

/** Public dashboard URL — no ?d=; the Vite proxy injects it server-side. */
export function getProxiedDashboardUrl(env = process.env) {
  return `${getPublicAppBase(env)}/_dashboard`;
}

export const DEFAULT_LOCAL_DASHBOARD_PORT = 6790;
/** Previous Convex CLI served a separate dashboard API here; keep for stale-process cleanup. */
export const LEGACY_LOCAL_DASHBOARD_API_PORT = 6791;

function localDashboardConfigPath(projectDir = process.cwd()) {
  return path.join(projectDir, '.convex', 'local', 'default', 'dashboard.json');
}

/** Port the anonymous local dashboard actually bound (Convex 1.43+). */
export function readLocalDashboardPort(options = {}) {
  const configPath = options.dashboardConfigPath ?? localDashboardConfigPath(options.projectDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Number.isInteger(parsed.port) && parsed.port > 0) {
      return parsed.port;
    }
  } catch {
    // Missing or invalid — Convex still defaults to 6790 when free.
  }
  return DEFAULT_LOCAL_DASHBOARD_PORT;
}

export function getLocalDashboardUiUrl(options = {}) {
  return `http://127.0.0.1:${readLocalDashboardPort(options)}`;
}

export function getLocalDashboardReadyUrl(options = {}) {
  return `${getLocalDashboardUiUrl(options)}/api/current_deployment`;
}

export function isLocalDashboardReady(body) {
  if (typeof body !== 'string' || !body) {
    return false;
  }
  if (body.includes('"deployments"')) {
    return true;
  }
  try {
    const parsed = JSON.parse(body);
    return Boolean(parsed && typeof parsed === 'object' && (parsed.url || parsed.name));
  } catch {
    return false;
  }
}

export const CONVEX_DASHBOARD_UI_URL = getLocalDashboardUiUrl();
/** Same origin as the UI — current Convex serves `/api/current_deployment` on this port. */
export const CONVEX_DASHBOARD_API_URL = CONVEX_DASHBOARD_UI_URL;

/** TCP ports dev:all binds; used to stop stale listeners before startup. */
export function getDevCleanupPorts(env = process.env) {
  const { api, site } = readLocalConvexBackendTargets({ env });
  const ports = new Set([
    getDevServerPort(env),
    4002,
    4003,
    String(DEFAULT_LOCAL_DASHBOARD_PORT),
    String(LEGACY_LOCAL_DASHBOARD_API_PORT),
    String(readLocalDashboardPort()),
    new URL(api).port,
    new URL(site).port,
  ]);

  return [...ports]
    .map((value) => Number.parseInt(String(value), 10))
    .filter((port) => !Number.isNaN(port) && port > 0)
    .toSorted((a, b) => a - b);
}

function isLoopbackConvexUrl(url) {
  return isLoopbackUrl(url);
}

export function isLocalConvexDeploymentFromFile(envLocalPath = DEFAULT_ENV_LOCAL_PATH) {
  if (!fs.existsSync(envLocalPath)) {
    return false;
  }
  return isLocalConvexDeployment(fs.readFileSync(envLocalPath, 'utf8'));
}

export function isProxiedLocalConvex(envLocalPath = DEFAULT_ENV_LOCAL_PATH) {
  if (!isLocalConvexDeploymentFromFile(envLocalPath)) {
    return false;
  }
  return isPublicProxyHost(getPublicAppBase());
}

export function getCustomAuthSiteUrl(env = process.env) {
  return getProxiedConvexSiteUrl(env);
}

export function readLocalConvexBackendEnv(envLocalPath = DEFAULT_ENV_LOCAL_PATH) {
  const { api, site } = readLocalConvexBackendTargets({ envLocalPath });
  return {
    VITE_CONVEX_BACKEND_URL: api,
    VITE_CONVEX_BACKEND_SITE_URL: site,
  };
}

export function ensureProxiedEnvFileUrls(envLocalPath = DEFAULT_ENV_LOCAL_PATH) {
  if (!isProxiedLocalConvex(envLocalPath)) {
    return;
  }
  const directApi = readEnvLocalVar('VITE_CONVEX_URL', envLocalPath);
  const directSite = readEnvLocalVar('VITE_CONVEX_SITE_URL', envLocalPath);
  if (directApi && isLoopbackConvexUrl(directApi)) {
    writeEnvLocalVar('VITE_CONVEX_BACKEND_URL', directApi, envLocalPath);
    if (directSite && isLoopbackConvexUrl(directSite)) {
      writeEnvLocalVar('VITE_CONVEX_BACKEND_SITE_URL', directSite, envLocalPath);
    }
  }
}

export function applyPublicViteConvexEnv(env = process.env) {
  env.VITE_CONVEX_URL = getProxiedConvexUrl(env);
  env.VITE_CONVEX_SITE_URL = getProxiedConvexSiteUrl(env);
}

export function stripProxiedViteConvexVars(envLocalPath = DEFAULT_ENV_LOCAL_PATH) {
  if (!isProxiedLocalConvex(envLocalPath) || !fs.existsSync(envLocalPath)) {
    return;
  }
  const contents = fs.readFileSync(envLocalPath, 'utf8');
  const next = contents
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith('VITE_CONVEX_URL=https:') &&
        !trimmed.startsWith('VITE_CONVEX_SITE_URL=https:')
      );
    })
    .join('\n');
  fs.writeFileSync(envLocalPath, next.endsWith('\n') ? next : `${next}\n`, 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Railway sets `npm_config_production`, which makes every `npx`/`npm` print a warning. */
export function prepareContainerProcessEnv(env = process.env) {
  delete env.NPM_CONFIG_PRODUCTION;
  delete env.npm_config_production;
  if (!env.BROWSERSLIST_IGNORE_OLD_DATA) {
    env.BROWSERSLIST_IGNORE_OLD_DATA = '1';
  }
}

function listListeningPids(port) {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) {
      return [];
    }
    return [...new Set(output.split(/\r?\n/).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function cleanupStaleDevPorts(env = process.env) {
  const ports = getDevCleanupPorts(env);
  if (ports.length === 0) {
    return;
  }
  console.error(`[dev-all] Checking for stale dev processes on ports: ${ports.join(' ')}`);
  let killed = 0;
  for (const port of ports) {
    for (const pid of listListeningPids(port)) {
      try {
        const cmd = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim() || 'unknown';
        console.error(`[dev-all] Stopping stale process on port ${port}: ${cmd} (pid ${pid})`);
        process.kill(Number(pid), 'SIGTERM');
        killed += 1;
      } catch {
        // process already gone
      }
    }
  }
  if (killed === 0) {
    return;
  }
  await sleep(1000);
  for (const port of ports) {
    for (const pid of listListeningPids(port)) {
      try {
        console.error(`[dev-all] Force-stopping process still on port ${port} (pid ${pid})`);
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // ignore
      }
    }
  }
}

export async function waitForConvexLoopbackEnv(
  envLocalPath = DEFAULT_ENV_LOCAL_PATH,
  maxAttempts = 90
) {
  let lastSeen = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastSeen = readEnvLocalVar('VITE_CONVEX_URL', envLocalPath) ?? '';
    if (isLoopbackConvexUrl(lastSeen)) {
      return true;
    }
    await sleep(1000);
  }
  if (lastSeen) {
    console.error(
      `[env-urls] WARN: Timed out waiting for loopback VITE_CONVEX_URL (current value: ${lastSeen})`
    );
  } else {
    console.error(
      '[env-urls] WARN: Timed out waiting for loopback VITE_CONVEX_URL (VITE_CONVEX_URL is unset in .env.local)'
    );
  }
  return false;
}

async function fetchOk(url, timeoutMs = 2000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForConvexBackendPort(maxAttempts = 60) {
  const url = readLocalConvexBackendTargets().api;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if ((await fetchOk(`${url}/version`)) || (await fetchOk(url))) {
      return true;
    }
    await sleep(1000);
  }
  return false;
}

/** Port-up is not push-complete. Wait until `npx convex run` can see the function. */
export async function waitForConvexFunction(functionPath, maxAttempts = 60) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      execSync(`npx convex run ${functionPath} "{}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return true;
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message ?? ''}`;
      if (!output.includes('Could not find function')) {
        return true;
      }
    }
    await sleep(2000);
  }
  return false;
}

const EMULATE_PROBE_URLS = ['http://127.0.0.1:4002', 'http://localhost:4002'];

/** Any HTTP response counts. `lsof` is not installed in the Railway image. */
async function httpResponded(url, timeoutMs = 2000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await response.arrayBuffer().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export async function waitForEmulatePort(maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const url of EMULATE_PROBE_URLS) {
      if (await httpResponded(url)) {
        return true;
      }
    }
    await sleep(1000);
  }
  console.error('[env-urls] WARN: Timed out waiting for Google emulate on port 4002.');
  return false;
}

export async function waitForConvexDashboardPort(maxAttempts) {
  const attempts = maxAttempts ?? (isProxiedLocalConvex() ? 120 : 60);
  let lastUrl = getLocalDashboardReadyUrl();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastUrl = getLocalDashboardReadyUrl();
    try {
      const response = await fetch(lastUrl, { signal: AbortSignal.timeout(2000) });
      const body = await response.text();
      if (isLocalDashboardReady(body)) {
        return true;
      }
    } catch {
      // retry
    }
    await sleep(1000);
  }
  console.error(`[env-urls] WARN: Timed out waiting for Convex dashboard at ${lastUrl}.`);
  return false;
}

export function ensureConvexCodegenAuthEnv(env = process.env) {
  if (env.AUTH_GOOGLE_ID || env.AUTH_GOOGLE_EMULATE_URL) {
    return;
  }
  env.AUTH_GOOGLE_EMULATE_URL = getEmulatePublicUrl(env);
}

export async function syncE2eAuthSecretToConvex(env = process.env) {
  const secret = requireE2eAuthSecret(env);
  if (!convexEnvHas('E2E_AUTH_SECRET')) {
    console.error('[e2e-auth] Pushing E2E_AUTH_SECRET to local Convex deployment...');
    await setConvexEnvVar('E2E_AUTH_SECRET', secret);
  } else {
    const deployed = readConvexEnv('E2E_AUTH_SECRET');
    if (deployed !== secret) {
      console.error('[e2e-auth] Updating E2E_AUTH_SECRET on local Convex deployment...');
      await setConvexEnvVar('E2E_AUTH_SECRET', secret);
    }
  }

  await syncLocalConvexAuthEnv();
}

/** Remove E2E-only Convex env after stack teardown or setup. */
export async function restoreDevConvexEnv() {
  if (convexEnvHas('E2E_AUTH_SECRET')) {
    console.error('[e2e-auth] Removing E2E_AUTH_SECRET from local Convex deployment...');
    await unsetConvexEnvVar('E2E_AUTH_SECRET');
  }
  if (convexEnvHas('E2E')) {
    console.error('[e2e-auth] Removing E2E from local Convex deployment...');
    await unsetConvexEnvVar('E2E');
  }
}

/** Drop stale proxied auth env on direct loopback Convex (JWT issuer must match CONVEX_SITE_URL). */
export async function syncLocalConvexAuthEnv() {
  if (isProxiedLocalConvex()) {
    return;
  }
  if (convexEnvHas('CUSTOM_AUTH_SITE_URL')) {
    console.error('[e2e-auth] Removing stale CUSTOM_AUTH_SITE_URL from local Convex deployment...');
    await unsetConvexEnvVar('CUSTOM_AUTH_SITE_URL');
  }
}

export function waitForTcpPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}
