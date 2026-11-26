import { describe, expect, it } from 'vitest';
import { resolvePlatformAdminAllowlist } from './auth';
import { resolveAuthProviderFlags } from './authProviders';
import { demoPasswordProfile, validateDemoPassword } from './passwordProvider';

describe('sign-in methods per deployment', () => {
  it('keeps local development exactly as before: Google (emulated) only', () => {
    expect(resolveAuthProviderFlags({})).toEqual({
      google: true,
      password: false,
      testLogin: false,
    });
  });

  it('uses only e-mail + password on the public demo', () => {
    expect(
      resolveAuthProviderFlags({ AUTH_PASSWORD_ENABLED: 'true', AUTH_GOOGLE_DISABLED: 'true' })
    ).toEqual({ google: false, password: true, testLogin: false });
  });

  it('ignores values other than "true"', () => {
    expect(
      resolveAuthProviderFlags({ AUTH_PASSWORD_ENABLED: '1', AUTH_GOOGLE_DISABLED: 'yes' })
    ).toEqual({ google: true, password: false, testLogin: false });
  });
});

describe('demo password provider', () => {
  it('accepts only the signIn flow, with a normalized e-mail', () => {
    expect(
      demoPasswordProfile({ flow: 'signIn', email: '  Hospital.Blooma@Example.com ' })
    ).toEqual({ email: 'hospital.blooma@example.com' });
  });

  it('blocks sign up, so nobody can take over a hospital e-mail', () => {
    expect(() =>
      demoPasswordProfile({ flow: 'signUp', email: 'hospital.blooma@example.com', password: 'x' })
    ).toThrow(/Cadastro/);
  });

  it('blocks password reset flows and a missing flow', () => {
    for (const flow of ['reset', 'reset-verification', 'email-verification', undefined]) {
      expect(() => demoPasswordProfile({ flow, email: 'hospital.blooma@example.com' })).toThrow();
    }
  });

  it('requires an e-mail', () => {
    expect(() => demoPasswordProfile({ flow: 'signIn', email: '  ' })).toThrow(/e-mail/);
  });

  it('requires passwords with at least 8 characters', () => {
    expect(() => validateDemoPassword('1234567')).toThrow();
    expect(() => validateDemoPassword('12345678')).not.toThrow();
  });
});

describe('platform admins on the public demo', () => {
  it('never falls back to the well-known dev e-mails when password sign-in is on', () => {
    expect(resolvePlatformAdminAllowlist({ AUTH_PASSWORD_ENABLED: 'true' })).toBe('');
  });

  it('keeps the local-dev defaults when password sign-in is off', () => {
    expect(resolvePlatformAdminAllowlist({})).toContain('platform@example.com');
  });

  it('always respects an explicit PLATFORM_ADMIN_EMAILS', () => {
    expect(
      resolvePlatformAdminAllowlist({
        AUTH_PASSWORD_ENABLED: 'true',
        PLATFORM_ADMIN_EMAILS: 'nenhum-admin@medbridge.invalid',
      })
    ).toBe('nenhum-admin@medbridge.invalid');
  });
});
