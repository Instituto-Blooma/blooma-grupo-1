/** Shared browser tab branding for build-time (Vite) and runtime (client). */

const RAILWAY_PR_HOST_RE = /-pr-(\d+)\.up\.railway\.app$/i;

/**
 * @param {string} host
 */
export function parseRailwayPrFromHost(host) {
  const match = host?.trim().toLowerCase().match(RAILWAY_PR_HOST_RE);
  if (!match) {
    return { isPr: false, prNumber: '' };
  }
  return { isPr: true, prNumber: match[1] };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getRailwayPublicDomain(env = process.env) {
  return env.RAILWAY_PUBLIC_DOMAIN?.trim() ?? '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'production' | 'staging' | 'development'}
 */
export function resolveAppEnv(env = process.env) {
  const explicit = env.VITE_APP_ENV?.trim().toLowerCase();
  if (explicit === 'staging' || explicit === 'development' || explicit === 'production') {
    return explicit;
  }

  const railway = env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  if (railway === 'staging') return 'staging';
  if (railway === 'production') return 'production';
  if (railway === 'local' || railway === 'pr') return 'development';

  if (parseRailwayPrFromHost(getRailwayPublicDomain(env)).isPr) {
    return 'development';
  }

  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveIsPrEnv(env = process.env) {
  if (env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase() === 'pr') {
    return true;
  }
  return parseRailwayPrFromHost(getRailwayPublicDomain(env)).isPr;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function resolvePrNumberSync(env = process.env) {
  const explicit = env.VITE_PR_NUMBER?.trim();
  if (explicit) return explicit;

  const fromDomain = parseRailwayPrFromHost(getRailwayPublicDomain(env));
  if (fromDomain.prNumber) return fromDomain.prNumber;

  const branch = env.RAILWAY_GIT_BRANCH?.trim() ?? '';
  const branchMatch =
    branch.match(/(?:^|\/)pr[-/](\d+)/i) ??
    branch.match(/-pr-(\d+)(?:$|[-/])/i) ??
    branch.match(/-pr-(\d+)$/i);
  if (branchMatch) return branchMatch[1];

  return undefined;
}

/**
 * @param {'production' | 'staging' | 'development'} appEnv
 */
export function getBaseTitlePrefix(appEnv) {
  if (appEnv === 'staging') return 'Staging';
  if (appEnv === 'development') return 'Dev';
  return 'MedBridge';
}

/**
 * @param {{
 *   appEnv: 'production' | 'staging' | 'development';
 *   isPrEnv: boolean;
 *   prNumber?: string;
 * }} branding
 */
export function getAppTitlePrefix({ appEnv, isPrEnv, prNumber }) {
  const base = getBaseTitlePrefix(appEnv);
  if (!isPrEnv) return base;

  const number = prNumber?.trim();
  if (number) return `[PR #${number}] ${base}`;
  return `[PR] ${base}`;
}

/**
 * @param {{
 *   appEnv: 'production' | 'staging' | 'development';
 *   isPrEnv: boolean;
 * }} branding
 */
export function getFaviconHref({ appEnv, isPrEnv }) {
  if (isPrEnv) return '/favicon-pr.png';
  return appEnv === 'production' ? '/favicon.png' : '/favicon-staging.png';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveAppBranding(env = process.env) {
  const appEnv = resolveAppEnv(env);
  const isPrEnv = resolveIsPrEnv(env);
  const prNumber = resolvePrNumberSync(env);

  return {
    appEnv,
    isPrEnv,
    prNumber: prNumber ?? '',
    titlePrefix: getAppTitlePrefix({ appEnv, isPrEnv, prNumber }),
    faviconHref: getFaviconHref({ appEnv, isPrEnv }),
  };
}

/**
 * Resolve PR number from GitHub when Railway git vars are available.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<string | undefined>}
 */
export async function resolvePrNumberFromGitHub(env = process.env) {
  const existing = resolvePrNumberSync(env);
  if (existing) return existing;

  const owner = env.RAILWAY_GIT_REPO_OWNER?.trim();
  const repo = env.RAILWAY_GIT_REPO_NAME?.trim();
  const sha = env.RAILWAY_GIT_COMMIT_SHA?.trim();
  const branch = env.RAILWAY_GIT_BRANCH?.trim();

  if (!owner || !repo) return undefined;

  const token = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim();
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'saas-template-app-branding',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchOpts = { headers, signal: AbortSignal.timeout(5000) };

  try {
    if (sha) {
      const commitPullsUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/pulls`;
      const commitRes = await fetch(commitPullsUrl, fetchOpts);
      if (commitRes.ok) {
        const pulls = await commitRes.json();
        if (Array.isArray(pulls) && typeof pulls[0]?.number === 'number') {
          return String(pulls[0].number);
        }
      }
    }

    if (branch) {
      const branchPullsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=open&per_page=1`;
      const branchRes = await fetch(branchPullsUrl, fetchOpts);
      if (branchRes.ok) {
        const pulls = await branchRes.json();
        if (Array.isArray(pulls) && typeof pulls[0]?.number === 'number') {
          return String(pulls[0].number);
        }
      }
    }
  } catch {
    // Best-effort lookup; fall back to [PR] without a number.
  }

  return undefined;
}

/**
 * Populate VITE_PR_NUMBER on Railway PR environments when it can be inferred.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function ensurePrBrandingEnv(env = process.env) {
  if (!resolveIsPrEnv(env)) return env;

  process.env.VITE_IS_PR = 'true';

  if (!resolvePrNumberSync(env)) {
    const prNumber = await resolvePrNumberFromGitHub(env);
    if (prNumber) {
      process.env.VITE_PR_NUMBER = prNumber;
    }
  }

  return process.env;
}
