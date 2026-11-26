// Pure safety checks used by script/demo-cloud.mjs (kept separate so they can be unit tested).
// None of these functions prints or stores a secret.

/**
 * Deployment name from a production deploy key ("prod:<name>|<secret>").
 * @param {string | undefined} key
 * @returns {{ ok: true, deployment: string } | { ok: false, reason: 'missing' | 'not-prod' }}
 */
export function parseProdDeployKey(key) {
  const trimmed = key?.trim();
  if (!trimmed) {
    return { ok: false, reason: 'missing' };
  }
  const match = /^prod:([^|\s]+)\|\S+$/.exec(trimmed);
  if (!match) {
    return { ok: false, reason: 'not-prod' };
  }
  return { ok: true, deployment: match[1] };
}

/**
 * The key's deployment must be exactly the one the team expects (DEMO_EXPECTED_DEPLOYMENT).
 * @param {string} deployment
 * @param {string | undefined} expected
 * @returns {{ ok: true } | { ok: false, reason: 'expected-missing' | 'mismatch' }}
 */
export function checkExpectedDeployment(deployment, expected) {
  const wanted = expected?.trim();
  if (!wanted) {
    return { ok: false, reason: 'expected-missing' };
  }
  return deployment === wanted ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/**
 * Public site address of the demo: https only, without trailing slashes.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function normalizeSiteUrl(value) {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed || !/^https:\/\/[^\s/]+(\/\S*)?$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** True when a SITE_URL points at a developer machine (the local backend). */
export function isLocalSiteUrl(value) {
  return typeof value === 'string' && /localhost|127\.0\.0\.1|\[::1\]/i.test(value);
}

/**
 * Replaces every occurrence of the given secrets in a text (e.g. a Convex CLI error) with ***.
 * @param {string} text
 * @param {ReadonlyArray<string | undefined>} secrets
 */
export function redactSecrets(text, secrets) {
  let result = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) {
      continue;
    }
    // Also the JSON-escaped form, as it appears when the CLI echoes function arguments.
    const escaped = JSON.stringify(secret).slice(1, -1);
    for (const variant of new Set([secret, escaped])) {
      result = result.split(variant).join('***');
    }
  }
  return result;
}
