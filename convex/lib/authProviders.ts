/**
 * Which sign-in methods this deployment offers, from Convex environment variables.
 *
 * - Local development sets neither flag: Google (emulated) only, exactly as before.
 * - The public demo sets `AUTH_PASSWORD_ENABLED=true` and `AUTH_GOOGLE_DISABLED=true`:
 *   e-mail + password only (Google would otherwise point at the local emulator).
 */
export function resolveAuthProviderFlags(env: Record<string, string | undefined> = process.env) {
  return {
    google: env.AUTH_GOOGLE_DISABLED?.trim().toLowerCase() !== 'true',
    password: env.AUTH_PASSWORD_ENABLED?.trim().toLowerCase() === 'true',
    testLogin: Boolean(env.E2E_AUTH_SECRET?.trim()),
  };
}
