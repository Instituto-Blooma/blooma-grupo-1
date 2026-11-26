import { describe, expect, it } from 'vitest';
import {
  checkExpectedDeployment,
  isLocalSiteUrl,
  normalizeSiteUrl,
  parseProdDeployKey,
  redactSecrets,
} from './demo-cloud-checks.mjs';

describe('parseProdDeployKey', () => {
  it('extracts the deployment name of a production key', () => {
    expect(parseProdDeployKey('prod:happy-otter-123|eyJabc')).toEqual({
      ok: true,
      deployment: 'happy-otter-123',
    });
    expect(parseProdDeployKey('  prod:happy-otter-123|eyJabc  ')).toEqual({
      ok: true,
      deployment: 'happy-otter-123',
    });
  });

  it('refuses a missing key', () => {
    expect(parseProdDeployKey(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(parseProdDeployKey('   ')).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuses development, preview and malformed keys', () => {
    for (const key of [
      'dev:happy-otter-123|eyJabc',
      'preview:team:project|eyJabc',
      'prod:happy-otter-123',
      'prod:|eyJabc',
      'prod:happy otter|eyJabc',
      'anonymous:anonymous-agent',
    ]) {
      expect(parseProdDeployKey(key)).toEqual({ ok: false, reason: 'not-prod' });
    }
  });
});

describe('checkExpectedDeployment', () => {
  it('accepts only an exact match', () => {
    expect(checkExpectedDeployment('happy-otter-123', 'happy-otter-123')).toEqual({ ok: true });
    expect(checkExpectedDeployment('happy-otter-123', ' happy-otter-123 ')).toEqual({ ok: true });
  });

  it('refuses a different deployment, including near matches', () => {
    for (const expected of [
      'happy-otter-124',
      'Happy-Otter-123',
      'happy-otter',
      'happy-otter-1234',
    ]) {
      expect(checkExpectedDeployment('happy-otter-123', expected)).toEqual({
        ok: false,
        reason: 'mismatch',
      });
    }
  });

  it('requires DEMO_EXPECTED_DEPLOYMENT to be set', () => {
    expect(checkExpectedDeployment('happy-otter-123', undefined)).toEqual({
      ok: false,
      reason: 'expected-missing',
    });
    expect(checkExpectedDeployment('happy-otter-123', '  ')).toEqual({
      ok: false,
      reason: 'expected-missing',
    });
  });
});

describe('normalizeSiteUrl', () => {
  it('keeps https addresses without trailing slashes', () => {
    expect(normalizeSiteUrl('https://medbridge-demo.pages.dev/')).toBe(
      'https://medbridge-demo.pages.dev'
    );
    expect(normalizeSiteUrl(' https://medbridge-demo.pages.dev ')).toBe(
      'https://medbridge-demo.pages.dev'
    );
  });

  it('refuses http, empty and malformed addresses', () => {
    for (const value of [
      undefined,
      '',
      'http://medbridge-demo.pages.dev',
      'medbridge-demo.pages.dev',
      'https://',
    ]) {
      expect(normalizeSiteUrl(value)).toBeNull();
    }
  });
});

describe('isLocalSiteUrl', () => {
  it('detects the local development backend', () => {
    expect(isLocalSiteUrl('http://localhost:5173')).toBe(true);
    expect(isLocalSiteUrl('http://127.0.0.1:3211')).toBe(true);
    expect(isLocalSiteUrl('https://medbridge-demo.pages.dev')).toBe(false);
    expect(isLocalSiteUrl(null)).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('masks every occurrence of the secrets, raw and JSON-escaped', () => {
    const password = 'se"nha\\secreta';
    const key = 'prod:happy-otter-123|eyJsecret';
    const output = `Object: {"email":"a@b.c","password":${JSON.stringify(password)}} key=${key} ${password}`;
    const masked = redactSecrets(output, [key, password]);
    expect(masked).not.toContain('secreta');
    expect(masked).not.toContain('eyJsecret');
    expect(masked).toContain('***');
  });

  it('ignores empty or very short values', () => {
    expect(redactSecrets('abc abc', [undefined, '', 'ab'])).toBe('abc abc');
  });
});
