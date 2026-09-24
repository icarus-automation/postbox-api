import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFY_KIND = 'verify-cms-api';
export const DEFAULT_PORT = 18000;
export const VERIFY_DATABASE = 'cms_api_verify';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const skillDir = resolve(scriptsDir, '..');
export const repoRoot = resolve(skillDir, '../../..');
export const runDir = join(skillDir, 'run');
export const artifactsDir = join(skillDir, 'artifacts');
export const instancePath = join(runDir, 'instance.json');
export const cookiesPath = join(runDir, 'cookies.json');
export const accountPath = join(runDir, 'account.json');
export const serverLogPath = join(runDir, 'server.log');

const require = createRequire(import.meta.url);

export function ensureRunDir() {
  mkdirSync(runDir, { recursive: true });
}

export function loadDotEnv() {
  const envPath = join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Copy .env.example to .env and fill it in.`);
  }

  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    let value = trimmed.slice(index + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index)] = value;
  }
  return env;
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value) {
  ensureRunDir();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readInstance() {
  return readJson(instancePath, null);
}

export function requireInstance() {
  const instance = readInstance();
  if (!instance || instance.kind !== VERIFY_KIND) {
    throw new Error(
      'No verification instance is registered. Run launch.mjs. Never drive a process that this skill did not start (including whatever is already on port 8000).',
    );
  }
  return instance;
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function portStatus(port, host = '127.0.0.1') {
  return new Promise((resolveStatus) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolveStatus('open');
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolveStatus('closed');
    });
    socket.on('error', () => resolveStatus('closed'));
  });
}

function loadPgClient() {
  const { Client } = require(
    require.resolve('pg', { paths: [require.resolve('@prisma/adapter-pg')] }),
  );
  return Client;
}

export function withVerifyDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = `/${VERIFY_DATABASE}`;
  return url.toString();
}

export function redactDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.password) url.password = '***';
  return url.toString();
}

export async function ensureVerifyDatabase(sourceUrl) {
  const Client = loadPgClient();
  const admin = new URL(sourceUrl);
  const sourceDb = decodeURIComponent(admin.pathname.replace(/^\//, '')) || 'postgres';
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {});
    const fallback = new Client({ connectionString: sourceUrl });
    try {
      await fallback.connect();
      const exists = await fallback.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [VERIFY_DATABASE],
      );
      if (exists.rowCount === 0) {
        await fallback.query(`CREATE DATABASE ${VERIFY_DATABASE}`);
      }
      return;
    } catch (fallbackError) {
      throw new Error(
        `Cannot reach PostgreSQL to create ${VERIFY_DATABASE} (tried ${sourceDb} and postgres): ${fallbackError.message}. Original: ${error.message}`,
      );
    } finally {
      await fallback.end().catch(() => {});
    }
  }

  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [VERIFY_DATABASE],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE ${VERIFY_DATABASE}`);
    }
  } finally {
    await client.end();
  }
}

function runNodeCli(scriptPath, args, extraEnv = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    windowsHide: true,
  });
}

export function migrateVerifyDatabase(databaseUrl) {
  const result = runNodeCli(
    join(repoRoot, 'node_modules/prisma/build/index.js'),
    ['migrate', 'deploy'],
    { DATABASE_URL: databaseUrl },
  );

  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed:\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }

  return (result.stdout || '').trim();
}

export function buildApi() {
  const result = runNodeCli(
    join(repoRoot, 'node_modules/@nestjs/cli/bin/nest.js'),
    ['build'],
  );

  if (result.status !== 0) {
    throw new Error(
      `nest build failed:\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }

  return (result.stdout || '').trim();
}

export function prepareAccount(existing) {
  if (existing?.email && existing?.password && existing?.name) return existing;

  const runId = randomBytes(4).toString('hex');
  const account = {
    name: `Verify ${runId}`,
    email: `verify-${runId}@cms-api.test`,
    password: randomBytes(16).toString('hex'),
  };
  writeJson(accountPath, account);
  return account;
}

export function startApi({ env, logPath }) {
  ensureRunDir();
  writeFileSync(logPath, `--- launch ${new Date().toISOString()} ---\n`, {
    flag: 'a',
  });
  const logFd = openSync(logPath, 'a');

  const child = spawn(process.execPath, [join(repoRoot, 'dist/main.js')], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });

  child.unref();
  return child;
}

export function stopPid(pid) {
  if (!pidAlive(pid)) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

export function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function tailLog(path, lines = 40) {
  if (!existsSync(path)) return '';
  const parts = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  return parts.slice(-lines).join('\n');
}

export function loadCookies() {
  return readJson(cookiesPath, {});
}

export function saveCookies(jar) {
  writeJson(cookiesPath, jar);
}

export function applySetCookie(jar, headers) {
  const lines =
    typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair, ...attrs] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1);
    const expired = attrs.some((attr) => {
      const lower = attr.trim().toLowerCase();
      return (
        lower === 'max-age=0' ||
        lower.startsWith('expires=thu, 01 jan 1970')
      );
    });
    if (expired || value === '') delete jar[name];
    else jar[name] = value;
  }
  return jar;
}

export function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function coerceJsonValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

export function assignPath(target, dotted, value) {
  const parts = dotted.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

export function parseJsonFields(fields) {
  const body = {};
  for (const field of fields) {
    const eq = field.indexOf('=');
    if (eq === -1) {
      throw new Error(`--json needs key=value, got ${field}`);
    }
    assignPath(body, field.slice(0, eq), coerceJsonValue(field.slice(eq + 1)));
  }
  return body;
}

export function redactValue(value, keys) {
  if (!keys.length) return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, keys));
  if (value && typeof value === 'object') {
    const copy = {};
    for (const [key, nested] of Object.entries(value)) {
      copy[key] = keys.includes(key)
        ? '<redacted>'
        : redactValue(nested, keys);
    }
    return copy;
  }
  return value;
}

export async function requestJson({
  instance,
  method,
  path,
  body,
  extraHeaders = {},
  sendCookies = true,
}) {
  const jar = loadCookies();
  const headers = {
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
    Origin: instance.baseUrl,
    ...extraHeaders,
  };

  if (sendCookies) {
    const cookie = cookieHeader(jar);
    if (cookie) headers.Cookie = cookie;
  }

  const init = { method, headers, redirect: 'manual' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const url = new URL(path, instance.baseUrl);
  const response = await fetch(url, init);
  applySetCookie(jar, response.headers);
  if (sendCookies) saveCookies(jar);

  const text = await response.text();
  let parsed = text;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || /^[\[{]/.test(text.trim())) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return {
    request: { method, path: `${url.pathname}${url.search}` },
    status: response.status,
    ok: response.ok,
    headers: {
      'content-type': contentType,
      'set-cookie-names': Object.keys(jar),
    },
    body: parsed,
  };
}
