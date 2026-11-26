import { Password } from '@convex-dev/auth/providers/Password';
import { ConvexError, type Value } from 'convex/values';
import type { DataModel } from '../_generated/dataModel';
import { normalizeEmail } from './users';

/** Provider id used by `signIn('password', ...)` and by the demo account script. */
export const PASSWORD_PROVIDER_ID = 'password';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Only "signIn" is accepted from the browser. Accounts are created by the server
 * (`demoAccounts:setPassword`), so nobody can "sign up" with a hospital e-mail and take it over,
 * and there is no password reset by e-mail in the demo.
 */
export function demoPasswordProfile(params: Record<string, Value | undefined>) {
  if (params.flow !== 'signIn') {
    throw new ConvexError('Cadastro e troca de senha não estão disponíveis nesta demonstração.');
  }
  const email = typeof params.email === 'string' ? normalizeEmail(params.email) : '';
  if (!email) {
    throw new ConvexError('Informe o e-mail');
  }
  return { email };
}

export function validateDemoPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ConvexError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
}

/** E-mail + password sign-in for the public demo (enabled by `AUTH_PASSWORD_ENABLED=true`). */
export function createDemoPasswordProvider() {
  return Password<DataModel>({
    id: PASSWORD_PROVIDER_ID,
    profile: (params) => demoPasswordProfile(params),
    validatePasswordRequirements: validateDemoPassword,
  });
}
