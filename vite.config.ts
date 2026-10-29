import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'node:path';
import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http';
import { resolveAppBranding } from './script/app-branding.mjs';
import {
  ensureDashboardDeploymentQuery,
  getAllowedHosts,
  getDevServerPort,
  getLocalDashboardUiUrl,
  isRemoteDevHost,
  readConvexDeploymentName,
  readLocalConvexBackendTargets,
  rewriteDashboardCurrentDeploymentBody,
  rewriteWellKnownConvexProxyPath,
} from './script/env-urls.mjs';

const envLocalPath = path.resolve(import.meta.dirname, '.env.local');

const convexBackendTargets = readLocalConvexBackendTargets({ envLocalPath });
const convexApiOrigin = new URL(convexBackendTargets.api).origin;
const convexSiteOrigin = new URL(convexBackendTargets.site).origin;
const convexApiOriginPattern = convexApiOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dashboardOrigin = getLocalDashboardUiUrl();

const isRemoteDev = isRemoteDevHost();
const devServerPort = getDevServerPort();
const allowedHosts = getAllowedHosts();

const appBranding = resolveAppBranding();
const {
  appEnv,
  isPrEnv,
  prNumber,
  titlePrefix: appTitlePrefix,
  faviconHref: appFaviconHref,
} = appBranding;

function publicRequestOrigin(req: IncomingMessage): string {
  const host = req.headers.host ?? `localhost:${devServerPort}`;
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function rewriteDashboardPath(pathname: string): string {
  const stripped = pathname.replace(/^\/_dashboard/, '') || '/';
  const deploymentName = readConvexDeploymentName({ envLocalPath });
  return ensureDashboardDeploymentQuery(stripped, deploymentName);
}

function injectDashboardDeploymentQuery(proxyReq: ClientRequest, req: IncomingMessage): void {
  const deploymentName = readConvexDeploymentName({ envLocalPath });
  if (!deploymentName) {
    return;
  }

  const incoming = req.url ?? '/';
  const queryIndex = incoming.indexOf('?');
  const query = queryIndex === -1 ? '' : incoming.slice(queryIndex + 1);
  const pathname =
    (queryIndex === -1 ? incoming : incoming.slice(0, queryIndex)).replace(/^\/_dashboard/, '') ||
    '/';

  proxyReq.path = ensureDashboardDeploymentQuery(
    query ? `${pathname}?${query}` : pathname,
    deploymentName
  );
}

const DASHBOARD_NAV_SHIM =
  '<script>(function(){var P="/_dashboard";' +
  'function skip(u){return !u||u[0]!=="/"||u.indexOf("//")===0||u.indexOf(P)===0||u.indexOf("/_next")===0||u.indexOf("/_convex")===0;}' +
  'function add(u){return skip(u)?u:P+u;}' +
  'var ps=history.pushState,rs=history.replaceState;' +
  'history.pushState=function(s,t,u){return ps.call(this,s,t,u==null?u:add(String(u)));};' +
  'history.replaceState=function(s,t,u){return rs.call(this,s,t,u==null?u:add(String(u)));};' +
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a");if(!a)return;var h=a.getAttribute("href");if(h&&!skip(h))a.setAttribute("href",P+h);},true);' +
  '})();</script>';

const emulateProxy = {
  '/google-emulate': {
    target: 'http://localhost:4002',
    rewrite: (p: string) => p.replace(/^\/google-emulate/, ''),
    changeOrigin: true,
  },
  '/resend-emulate': {
    target: 'http://localhost:4003',
    rewrite: (p: string) => p.replace(/^\/resend-emulate/, ''),
    changeOrigin: true,
  },
  '/o/oauth2': {
    target: 'http://localhost:4002',
    changeOrigin: true,
  },
} as const;

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    {
      name: 'app-env-html',
      transformIndexHtml(html) {
        const withTitle = html.includes('<title>')
          ? html.replace(/<title>[^<]*<\/title>/, `<title>${appTitlePrefix}</title>`)
          : html.replace('<head>', `<head><title>${appTitlePrefix}</title>`);
        return withTitle.replace(/href="\/favicon\.png"/, `href="${appFaviconHref}"`);
      },
    },
  ],
  envDir: path.resolve(import.meta.dirname),
  define: {
    'import.meta.env.VITE_APP_ENV': JSON.stringify(appEnv),
    'import.meta.env.VITE_IS_PR': JSON.stringify(isPrEnv),
    'import.meta.env.VITE_PR_NUMBER': JSON.stringify(prNumber),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@assets': path.resolve(import.meta.dirname, 'public'),
    },
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    host: isRemoteDev ? '0.0.0.0' : undefined,
    port: devServerPort,
    strictPort: true,
    allowedHosts: isRemoteDev ? allowedHosts : undefined,
    hmr: isRemoteDev ? { clientPort: 443 } : undefined,
    proxy: {
      ...emulateProxy,
      '/_convex_site': {
        target: convexSiteOrigin,
        rewrite: (p) => p.replace(/^\/_convex_site/, ''),
        changeOrigin: true,
      },
      '/.well-known/oauth-authorization-server': {
        target: convexSiteOrigin,
        rewrite: rewriteWellKnownConvexProxyPath,
        changeOrigin: true,
      },
      '/.well-known/oauth-protected-resource': {
        target: convexSiteOrigin,
        rewrite: rewriteWellKnownConvexProxyPath,
        changeOrigin: true,
      },
      '/api/check_admin_key': {
        target: dashboardOrigin,
        changeOrigin: true,
      },
      '/api/current_deployment': {
        target: dashboardOrigin,
        changeOrigin: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res: ServerResponse) => {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              const body = rewriteDashboardCurrentDeploymentBody(
                raw,
                `${publicRequestOrigin(req)}/_convex`
              );
              const headers = { ...proxyRes.headers };
              delete headers['content-length'];
              for (const [key, val] of Object.entries(headers)) {
                if (val !== undefined) res.setHeader(key, val as string | string[]);
              }
              res.statusCode = proxyRes.statusCode ?? 200;
              res.end(body);
            });
          });
        },
      },
      '/_convex_dash_api': {
        target: dashboardOrigin,
        rewrite: (p) => p.replace(/^\/_convex_dash_api/, '') || '/',
        changeOrigin: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res: ServerResponse) => {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8');
              const host = req.headers.host ?? `localhost:${devServerPort}`;
              const proto =
                host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
              const body = raw.replace(
                new RegExp(convexApiOriginPattern, 'g'),
                `${proto}://${host}/_convex`
              );
              const headers = { ...proxyRes.headers };
              delete headers['content-length'];
              for (const [key, val] of Object.entries(headers)) {
                if (val !== undefined) res.setHeader(key, val as string | string[]);
              }
              res.statusCode = proxyRes.statusCode ?? 200;
              res.end(Buffer.from(body, 'utf8'));
            });
          });
        },
      },
      '/_convex': {
        target: convexApiOrigin,
        rewrite: (p) => p.replace(/^\/_convex/, ''),
        changeOrigin: true,
        ws: true,
      },
      '/_next': {
        target: dashboardOrigin,
        changeOrigin: true,
      },
      '/_dashboard': {
        target: dashboardOrigin,
        rewrite: rewriteDashboardPath,
        changeOrigin: true,
        ws: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyReq', injectDashboardDeploymentQuery);
          proxy.on('proxyRes', (proxyRes, _req, res: ServerResponse) => {
            const headers = { ...proxyRes.headers };
            delete headers['x-frame-options'];
            delete headers['content-security-policy'];

            const contentType = proxyRes.headers['content-type'] ?? '';
            const isHtml = contentType.includes('text/html');
            const encoding = proxyRes.headers['content-encoding'];

            if (isHtml && !encoding) {
              const chunks: Buffer[] = [];
              proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
              proxyRes.on('end', () => {
                let body = Buffer.concat(chunks).toString('utf8');
                body = body.replace(/http:\/\/127\.0\.0\.1:6791/g, '/_convex_dash_api');
                for (const asset of [
                  'favicon.ico',
                  'convex-logo-only.svg',
                  'apple-touch-icon.png',
                  'manifest.webmanifest',
                ]) {
                  const re = new RegExp(`(href|src)=(["'])\\/${asset}\\2`, 'g');
                  body = body.replace(re, `$1=$2/_dashboard/${asset}$2`);
                }
                body = body.replace('<head>', '<head>' + DASHBOARD_NAV_SHIM);
                delete headers['content-length'];
                const bodyBuf = Buffer.from(body, 'utf8');
                for (const [key, val] of Object.entries(headers)) {
                  if (val !== undefined) res.setHeader(key, val as string | string[]);
                }
                res.statusCode = proxyRes.statusCode ?? 200;
                res.end(bodyBuf);
              });
            } else {
              for (const [key, val] of Object.entries(headers)) {
                if (val !== undefined) res.setHeader(key, val as string | string[]);
              }
              res.statusCode = proxyRes.statusCode ?? 200;
              proxyRes.pipe(res);
            }
          });
        },
      },
    },
    fs: {
      strict: true,
      deny: ['**/.*'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: devServerPort,
    strictPort: Boolean(process.env.PORT),
    allowedHosts,
    proxy: emulateProxy,
  },
});
