/**
 * Sign-in method of this build. The public demo is built with `VITE_AUTH_MODE=password`
 * (e-mail + password); anything else keeps the Google sign-in used in local development.
 */
export function isPasswordLogin(env: Record<string, unknown> = import.meta.env) {
  return typeof env.VITE_AUTH_MODE === 'string' && env.VITE_AUTH_MODE.trim() === 'password';
}
