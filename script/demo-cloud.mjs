// Prepares the public demo deployment on Convex Cloud (see docs/deploy-demo.md).
//
// Every command talks ONLY to the deployment of the production deploy key in
// CONVEX_DEPLOY_KEY, and only if that deployment is exactly DEMO_EXPECTED_DEPLOYMENT.
// Secrets (deploy key, password) are read from the terminal session with
// `Read-Host -AsSecureString` (see the guide), never printed and never written to a file.
//
// Usage (PowerShell 5.1), after setting the session variables as in docs/deploy-demo.md:
//   node script/demo-cloud.mjs check               # target deployment and its SITE_URL
//   node script/demo-cloud.mjs env                 # auth keys + demo variables (checks SITE_URL)
//   node script/demo-cloud.mjs deploy              # publish the Convex functions
//   node script/demo-cloud.mjs seed [--reset]      # Hospital Blooma + Hospital Esperança
//   node script/demo-cloud.mjs accounts            # password of the demo hospital accounts
//
// Session variables: CONVEX_DEPLOY_KEY (secret), DEMO_EXPECTED_DEPLOYMENT, DEMO_SITE_URL,
// DEMO_PASSWORD (secret, only for `accounts`), optional DEMO_HOSPITALS (slugs, comma-separated).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkExpectedDeployment,
  isLocalSiteUrl,
  normalizeSiteUrl,
  parseProdDeployKey,
  redactSecrets,
} from './demo-cloud-checks.mjs';
import { ROOT_DIR, generateConvexAuthKeys } from './lib.mjs';

const CONVEX_BIN = join(ROOT_DIR, 'node_modules', 'convex', 'bin', 'main.js');
const DEFAULT_HOSPITALS = ['hospital-blooma', 'hospital-esperanca'];
const HOSPITAL_ACCOUNTS = {
  'hospital-blooma': 'hospital.blooma@example.com',
  'hospital-esperanca': 'hospital.esperanca@example.com',
  'hospital-sao-lucas': 'hospital.saolucas@example.com',
};
// Nobody uses this address: the demo has no platform admins.
const NO_PLATFORM_ADMIN = 'nenhum-admin@medbridge.invalid';

function fail(message) {
  console.error(`\n[demo-cloud] ${message}\n`);
  process.exit(1);
}

function log(message) {
  console.log(`[demo-cloud] ${message}`);
}

/** Every secret this run knows about, to be masked in any CLI output we show. */
function knownSecrets() {
  return [process.env.CONVEX_DEPLOY_KEY?.trim(), process.env.DEMO_PASSWORD];
}

/**
 * Runs the Convex CLI against the deploy key's deployment: no shell (nothing is expanded or
 * echoed by a shell) and without CONVEX_DEPLOYMENT, so .env.local's local deployment is never
 * used. With `quiet`, the CLI output is captured and only shown, with secrets masked, if the
 * command fails.
 */
function convex(args, { input, quiet = false, secrets = [] } = {}) {
  if (!existsSync(CONVEX_BIN)) {
    fail('Convex CLI não encontrada. Rode "pnpm install" antes.');
  }
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const result = spawnSync(process.execPath, [CONVEX_BIN, ...args], {
    cwd: ROOT_DIR,
    env,
    input,
    encoding: 'utf8',
    stdio: [
      input === undefined ? 'inherit' : 'pipe',
      quiet ? 'pipe' : 'inherit',
      quiet ? 'pipe' : 'inherit',
    ],
  });
  if (result.status !== 0) {
    if (quiet) {
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
      const masked = redactSecrets(output, [...knownSecrets(), ...secrets]);
      if (masked) {
        console.error(masked.split('\n').slice(-6).join('\n'));
      }
    }
    fail(`O comando "convex ${args[0]} ${args[1] === '--' ? args[2] : (args[1] ?? '')}" falhou.`);
  }
}

function setEnv(name, value) {
  // Value on stdin (never on a command line) and output captured: nothing is printed.
  convex(['env', 'set', '--', name], { input: value, quiet: true, secrets: [value] });
  log(`${name} definido.`);
}

/** Value of a Convex variable on the target deployment (null when unset). Only for checks. */
function readEnv(name) {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const result = spawnSync(process.execPath, [CONVEX_BIN, 'env', 'get', name], {
    cwd: ROOT_DIR,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const firstLine = redactSecrets((result.stderr ?? '').trim(), knownSecrets()).split('\n')[0];
    return { ok: false, value: null, error: firstLine };
  }
  const value = (result.stdout ?? '').trim();
  return { ok: true, value: value === '' ? null : value, error: '' };
}

function hasEnv(name) {
  return readEnv(name).value !== null;
}

/**
 * Runs before every command, before anything is read from or written to the deployment:
 * production key, exact expected deployment name, deployment reachable and not the local one.
 */
function assertTarget() {
  const key = parseProdDeployKey(process.env.CONVEX_DEPLOY_KEY);
  if (!key.ok) {
    fail(
      key.reason === 'missing'
        ? 'CONVEX_DEPLOY_KEY não está definida nesta sessão. Siga o passo 2 do docs/deploy-demo.md.'
        : 'CONVEX_DEPLOY_KEY não é uma chave de produção ("prod:...|..."). Nada foi feito.'
    );
  }
  const expected = checkExpectedDeployment(key.deployment, process.env.DEMO_EXPECTED_DEPLOYMENT);
  if (!expected.ok) {
    fail(
      expected.reason === 'expected-missing'
        ? 'Defina DEMO_EXPECTED_DEPLOYMENT com o nome do deployment de produção do medbridge-demo (painel do Convex). Nada foi feito.'
        : `A chave é do deployment "${key.deployment}", mas DEMO_EXPECTED_DEPLOYMENT é "${process.env.DEMO_EXPECTED_DEPLOYMENT?.trim()}". Nada foi feito.`
    );
  }
  log(`Deployment de destino: ${key.deployment} (confere com DEMO_EXPECTED_DEPLOYMENT)`);

  const site = readEnv('SITE_URL');
  if (!site.ok) {
    fail(
      `Não foi possível falar com o deployment da chave. Confira a CONVEX_DEPLOY_KEY.${site.error ? `\n${site.error}` : ''}`
    );
  }
  if (isLocalSiteUrl(site.value)) {
    fail(
      'O destino parece ser o backend LOCAL de desenvolvimento (SITE_URL aponta para localhost). Nada foi feito.'
    );
  }
  return { siteUrl: site.value };
}

function requireDemoSiteUrl() {
  const siteUrl = normalizeSiteUrl(process.env.DEMO_SITE_URL);
  if (!siteUrl) {
    fail('Defina DEMO_SITE_URL com o endereço público do site (https://...).');
  }
  return siteUrl;
}

function selectedHospitals() {
  const raw = process.env.DEMO_HOSPITALS?.trim();
  const slugs = raw
    ? raw
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean)
    : DEFAULT_HOSPITALS;
  const unknown = slugs.filter((slug) => !(slug in HOSPITAL_ACCOUNTS));
  if (unknown.length > 0) {
    fail(`Hospital desconhecido em DEMO_HOSPITALS: ${unknown.join(', ')}`);
  }
  return slugs;
}

async function configureEnv() {
  const siteUrl = requireDemoSiteUrl();
  if (hasEnv('JWT_PRIVATE_KEY') && hasEnv('JWKS')) {
    log('Chaves de login já existem neste deployment; mantidas.');
  } else {
    log('Gerando chaves de login novas, só para esta demonstração...');
    const keys = await generateConvexAuthKeys();
    setEnv('JWT_PRIVATE_KEY', keys.JWT_PRIVATE_KEY);
    setEnv('JWKS', keys.JWKS);
  }
  setEnv('SITE_URL', siteUrl);
  setEnv('AUTH_PASSWORD_ENABLED', 'true');
  setEnv('AUTH_GOOGLE_DISABLED', 'true');
  setEnv('PLATFORM_ADMIN_EMAILS', NO_PLATFORM_ADMIN);

  // Read it back from the deployment: it must be exactly the demo address.
  const saved = readEnv('SITE_URL');
  if (!saved.ok || saved.value !== siteUrl) {
    fail(
      `O SITE_URL gravado no deployment ("${saved.value ?? 'vazio'}") não é o esperado ("${siteUrl}").`
    );
  }
  log(`SITE_URL conferido: ${siteUrl}`);
}

function seed(reset) {
  const hospitals = selectedHospitals();
  log(`${reset ? 'Restaurando' : 'Criando'} dados fictícios: ${hospitals.join(', ')}`);
  convex(['run', 'demo:seedHospitals', JSON.stringify({ reset, hospitals })]);
}

function setAccounts() {
  const password = process.env.DEMO_PASSWORD ?? '';
  if (password.length < 8) {
    fail('DEMO_PASSWORD não está definida nesta sessão ou tem menos de 8 caracteres.');
  }
  for (const slug of selectedHospitals()) {
    const email = HOSPITAL_ACCOUNTS[slug];
    // The password travels only as an argument to the Convex CLI process (no shell, no file);
    // its output is captured and masked, so it is never shown.
    convex(['run', 'demoAccounts:setPassword', JSON.stringify({ email, password })], {
      quiet: true,
      secrets: [password],
    });
    log(`Senha definida para ${email}.`);
  }
}

async function main() {
  const command = process.argv[2];
  const commands = ['check', 'env', 'deploy', 'seed', 'accounts'];
  if (!commands.includes(command)) {
    fail('Uso: node script/demo-cloud.mjs {check|env|deploy|seed [--reset]|accounts}');
  }
  const target = assertTarget();

  switch (command) {
    case 'check':
      log(`SITE_URL atual do deployment: ${target.siteUrl ?? '(ainda não definido)'}`);
      break;
    case 'env':
      await configureEnv();
      break;
    case 'deploy':
      convex(['deploy']);
      break;
    case 'seed':
      seed(process.argv.includes('--reset'));
      break;
    case 'accounts':
      setAccounts();
      break;
  }
  log('Pronto.');
}

await main();
