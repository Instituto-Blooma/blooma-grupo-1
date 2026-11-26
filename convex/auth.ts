import { convexAuth, type AuthProviderConfig } from '@convex-dev/auth/server';
import type { MutationCtx } from './_generated/server';
import { createOrUpdateOAuthUser } from './lib/auth';
import { resolveAuthProviderFlags } from './lib/authProviders';
import { createGoogleProvider } from './lib/googleProvider';
import { createDemoPasswordProvider } from './lib/passwordProvider';
import { createTestLoginProvider } from './lib/testLoginProvider';

function createAuthProviders(): AuthProviderConfig[] {
  const flags = resolveAuthProviderFlags();
  const providers: AuthProviderConfig[] = [];
  if (flags.google) {
    providers.push(createGoogleProvider());
  }
  if (flags.password) {
    providers.push(createDemoPasswordProvider());
  }
  if (flags.testLogin) {
    providers.push(createTestLoginProvider());
  }
  return providers;
}

export const { auth, signIn, signOut, store } = convexAuth({
  providers: createAuthProviders(),
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      return await createOrUpdateOAuthUser(ctx as MutationCtx, args);
    },
  },
});
