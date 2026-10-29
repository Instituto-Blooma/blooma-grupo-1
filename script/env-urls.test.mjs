import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getAllowedHosts,
  getLocalDashboardReadyUrl,
  isLocalDashboardReady,
  readLocalDashboardPort,
  rewriteDashboardCurrentDeploymentBody,
  rewriteWellKnownConvexProxyPath,
} from './env-urls.mjs';

describe('rewriteWellKnownConvexProxyPath', () => {
  it('strips /_convex_site path insertion on well-known URLs', () => {
    expect(
      rewriteWellKnownConvexProxyPath('/.well-known/_convex_site/oauth-authorization-server')
    ).toBe('/.well-known/oauth-authorization-server');
    expect(rewriteWellKnownConvexProxyPath('/_convex_site')).toBe('');
    expect(rewriteWellKnownConvexProxyPath('/.well-known/oauth-authorization-server')).toBe(
      '/.well-known/oauth-authorization-server'
    );
  });
});

describe('rewriteDashboardCurrentDeploymentBody', () => {
  it('rewrites the loopback deployment URL to the public proxy', () => {
    expect(
      rewriteDashboardCurrentDeploymentBody(
        JSON.stringify({ url: 'http://127.0.0.1:3210' }),
        'https://app.example/_convex'
      )
    ).toBe(JSON.stringify({ url: 'https://app.example/_convex' }));
  });

  it('leaves non-JSON bodies unchanged', () => {
    expect(rewriteDashboardCurrentDeploymentBody('not-json', 'https://x/_convex')).toBe('not-json');
  });
});

describe('local dashboard readiness', () => {
  it('treats the current-deployment payload as ready', () => {
    expect(
      isLocalDashboardReady(
        JSON.stringify({
          name: 'anonymous-agent',
          url: 'http://127.0.0.1:3212',
          adminKey: 'secret',
        })
      )
    ).toBe(true);
  });

  it('still accepts the legacy deployments list', () => {
    expect(isLocalDashboardReady('{"deployments":[]}')).toBe(true);
  });

  it('rejects HTML or empty bodies', () => {
    expect(isLocalDashboardReady('<!doctype html>')).toBe(false);
    expect(isLocalDashboardReady('')).toBe(false);
  });

  it('reads the dashboard port from dashboard.json and probes /api/current_deployment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'convexplate-dash-'));
    const configPath = join(dir, 'dashboard.json');
    writeFileSync(configPath, JSON.stringify({ port: 6794 }));

    expect(readLocalDashboardPort({ dashboardConfigPath: configPath })).toBe(6794);
    expect(getLocalDashboardReadyUrl({ dashboardConfigPath: configPath })).toBe(
      'http://127.0.0.1:6794/api/current_deployment'
    );
  });

  it('defaults to port 6790 when dashboard.json is missing', () => {
    expect(readLocalDashboardPort({ dashboardConfigPath: '/no/such/dashboard.json' })).toBe(6790);
    expect(getLocalDashboardReadyUrl({ dashboardConfigPath: '/no/such/dashboard.json' })).toBe(
      'http://127.0.0.1:6790/api/current_deployment'
    );
  });
});

describe('getAllowedHosts', () => {
  it('always allows Railway hosts so vite preview can serve production', () => {
    expect(getAllowedHosts({})).toEqual(['.railway.app']);
  });

  it('includes the Railway public domain when set', () => {
    expect(
      getAllowedHosts({ RAILWAY_PUBLIC_DOMAIN: 'hackblooma-production.up.railway.app' })
    ).toEqual(['hackblooma-production.up.railway.app', '.railway.app']);
  });
});
