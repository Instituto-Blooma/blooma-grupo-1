import { createAccount, modifyAccountCredentials } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { DEMO_HOSPITALS } from './demo';
import { resolveAuthProviderFlags } from './lib/authProviders';
import { PASSWORD_PROVIDER_ID, validateDemoPassword } from './lib/passwordProvider';
import { normalizeEmail } from './lib/users';

/**
 * Sets (or changes) the e-mail + password sign-in of a demo hospital account.
 *
 * Internal only: it runs from the terminal with the deployment's deploy key
 * (`node script/demo-cloud.mjs accounts`), never from the browser. Only the accounts of
 * `DEMO_HOSPITALS` are accepted, and they must have been seeded first (`demo:seedHospitals`),
 * which makes them active members of their hospital.
 */
export const setPassword = internalAction({
  args: { email: v.string(), password: v.string() },
  returns: v.null(),
  handler: async (ctx, { email, password }) => {
    if (!resolveAuthProviderFlags().password) {
      throw new Error(
        'O login por senha está desligado neste deployment. Defina AUTH_PASSWORD_ENABLED=true antes.'
      );
    }
    const normalized = normalizeEmail(email);
    const hospital = DEMO_HOSPITALS.find(
      (candidate) => normalizeEmail(candidate.accountEmail) === normalized
    );
    if (!hospital) {
      throw new Error(`${email} não é uma conta de hospital de demonstração.`);
    }
    validateDemoPassword(password);

    const account = { id: normalized, secret: password };
    try {
      await modifyAccountCredentials(ctx, { provider: PASSWORD_PROVIDER_ID, account });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('does not exist')) {
        throw error;
      }
      // First time: create the password account, linked to the seeded hospital user.
      await createAccount(ctx, {
        provider: PASSWORD_PROVIDER_ID,
        account,
        profile: { email: normalized, name: hospital.name },
      });
    }
    return null;
  },
});
