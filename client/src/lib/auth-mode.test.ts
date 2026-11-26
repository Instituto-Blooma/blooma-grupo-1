import { describe, expect, it } from 'vitest';
import { isPasswordLogin } from './auth-mode';

describe('isPasswordLogin', () => {
  it('is off by default (local development keeps Google sign-in)', () => {
    expect(isPasswordLogin({})).toBe(false);
    expect(isPasswordLogin({ VITE_AUTH_MODE: 'google' })).toBe(false);
  });

  it('is on for builds made with VITE_AUTH_MODE=password', () => {
    expect(isPasswordLogin({ VITE_AUTH_MODE: 'password' })).toBe(true);
    expect(isPasswordLogin({ VITE_AUTH_MODE: ' password ' })).toBe(true);
  });
});
