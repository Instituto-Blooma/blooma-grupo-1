import { describe, expect, it } from 'vitest';
import {
  getAppTitlePrefix,
  getFaviconHref,
  parseRailwayPrFromHost,
  resolveAppBranding,
  resolveIsPrEnv,
  resolvePrNumberSync,
} from './app-branding.mjs';

describe('parseRailwayPrFromHost', () => {
  it('detects Railway PR preview hostnames', () => {
    expect(
      parseRailwayPrFromHost(
        'talentum-milestones-tracker-talentum-milestones-tracke-pr-51.up.railway.app'
      )
    ).toEqual({ isPr: true, prNumber: '51' });
  });
});

describe('resolveIsPrEnv', () => {
  it('detects Railway PR environments from env name', () => {
    expect(resolveIsPrEnv({ RAILWAY_ENVIRONMENT_NAME: 'pr' })).toBe(true);
    expect(resolveIsPrEnv({ RAILWAY_ENVIRONMENT_NAME: 'PR' })).toBe(true);
    expect(resolveIsPrEnv({ RAILWAY_ENVIRONMENT_NAME: 'local' })).toBe(false);
  });

  it('detects Railway PR environments from public domain', () => {
    expect(
      resolveIsPrEnv({
        RAILWAY_PUBLIC_DOMAIN:
          'talentum-milestones-tracker-talentum-milestones-tracke-pr-51.up.railway.app',
      })
    ).toBe(true);
  });
});

describe('resolvePrNumberSync', () => {
  it('prefers VITE_PR_NUMBER', () => {
    expect(resolvePrNumberSync({ VITE_PR_NUMBER: '42' })).toBe('42');
  });

  it('parses PR number from Railway public domain', () => {
    expect(
      resolvePrNumberSync({
        RAILWAY_PUBLIC_DOMAIN:
          'talentum-milestones-tracker-talentum-milestones-tracke-pr-51.up.railway.app',
      })
    ).toBe('51');
  });

  it('parses common PR branch patterns', () => {
    expect(resolvePrNumberSync({ RAILWAY_GIT_BRANCH: 'pr-17' })).toBe('17');
    expect(resolvePrNumberSync({ RAILWAY_GIT_BRANCH: 'cursor/feature-pr-88' })).toBe('88');
    expect(resolvePrNumberSync({ RAILWAY_GIT_BRANCH: 'feature/pr/123' })).toBe('123');
  });
});

describe('resolveAppBranding', () => {
  it('prefixes PR titles and uses the PR favicon from public domain', () => {
    const branding = resolveAppBranding({
      RAILWAY_PUBLIC_DOMAIN:
        'talentum-milestones-tracker-talentum-milestones-tracke-pr-51.up.railway.app',
    });

    expect(branding.titlePrefix).toBe('[PR #51] Dev');
    expect(branding.faviconHref).toBe('/favicon-pr.png');
    expect(branding.isPrEnv).toBe(true);
  });

  it('prefixes PR titles and uses the PR favicon from env name', () => {
    const branding = resolveAppBranding({
      RAILWAY_ENVIRONMENT_NAME: 'pr',
      VITE_PR_NUMBER: '47',
    });

    expect(branding.titlePrefix).toBe('[PR #47] Dev');
    expect(branding.faviconHref).toBe('/favicon-pr.png');
    expect(branding.isPrEnv).toBe(true);
  });

  it('keeps production branding unchanged', () => {
    const branding = resolveAppBranding({
      RAILWAY_ENVIRONMENT_NAME: 'production',
    });

    expect(getAppTitlePrefix(branding)).toBe('MedBridge');
    expect(getFaviconHref(branding)).toBe('/favicon.png');
  });
});
