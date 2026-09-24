#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import {
  DEFAULT_PORT,
  VERIFY_DATABASE,
  VERIFY_KIND,
  accountPath,
  artifactsDir,
  ensureRunDir,
  ensureVerifyDatabase,
  instancePath,
  loadDotEnv,
  buildApi,
  migrateVerifyDatabase,
  pidAlive,
  portStatus,
  prepareAccount,
  readInstance,
  redactDatabaseUrl,
  repoRoot,
  requestJson,
  serverLogPath,
  sleep,
  startApi,
  stopPid,
  tailLog,
  withVerifyDatabase,
  writeJson,
} from './lib.mjs';

const READY_TIMEOUT_MS = 90_000;

function fail(message) {
  console.error(message);
  process.exit(1);
}

const fileEnv = loadDotEnv();
const sourceUrl = fileEnv.DATABASE_URL;
if (!sourceUrl) fail('.env is missing DATABASE_URL');
if (!fileEnv.BETTER_AUTH_SECRET) fail('.env is missing BETTER_AUTH_SECRET');

const port = Number(process.env.VERIFY_PORT || DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1) fail('VERIFY_PORT must be a positive integer');

const existing = readInstance();
if (existing?.kind === VERIFY_KIND && pidAlive(existing.pid)) {
  const health = await requestJson({
    instance: existing,
    method: 'GET',
    path: '/api/v1/health',
    sendCookies: false,
  }).catch(() => null);

  if (health?.status === 200 && health.body?.status === 'ok') {
    console.log(
      JSON.stringify(
        {
          status: 'already-running',
          baseUrl: existing.baseUrl,
          pid: existing.pid,
          database: existing.database,
          account: accountPath,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
}

if (existing?.pid) stopPid(existing.pid);

const occupied = (await portStatus(port)) === 'open';
if (occupied) {
  fail(
    `127.0.0.1:${port} is already accepting connections and is not a healthy ${VERIFY_KIND} instance. Pick another VERIFY_PORT. Do not drive the process on port 8000.`,
  );
}

ensureRunDir();
const verifyUrl = withVerifyDatabase(sourceUrl);
console.error(`Ensuring database ${VERIFY_DATABASE}...`);
await ensureVerifyDatabase(sourceUrl);
console.error('Applying Prisma migrations...');
const migrateOutput = migrateVerifyDatabase(verifyUrl);
if (migrateOutput) console.error(migrateOutput);
console.error('Building the API...');
const buildOutput = buildApi();
if (buildOutput) console.error(buildOutput);

const account = prepareAccount();

const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = {
  ...process.env,
  ...fileEnv,
  NODE_ENV: 'development',
  PORT: String(port),
  DATABASE_URL: verifyUrl,
  BETTER_AUTH_URL: baseUrl,
  BETTER_AUTH_SECRET: fileEnv.BETTER_AUTH_SECRET,
};

writeFileSync(serverLogPath, '', { flag: 'a' });
const child = startApi({ env: childEnv, logPath: serverLogPath });
if (!child.pid) {
  fail('Failed to spawn dist/main.js.');
}

const instance = {
  kind: VERIFY_KIND,
  pid: child.pid,
  port,
  baseUrl,
  database: VERIFY_DATABASE,
  databaseUrl: redactDatabaseUrl(verifyUrl),
  logFile: serverLogPath,
  repoRoot,
  startedAt: new Date().toISOString(),
};
writeJson(instancePath, instance);

let ready = null;
const deadline = Date.now() + READY_TIMEOUT_MS;
while (Date.now() < deadline) {
  if (!pidAlive(child.pid)) {
    stopPid(child.pid);
    fail(
      `Verification API exited before it became healthy.\n${tailLog(serverLogPath)}`,
    );
  }

  ready = await requestJson({
    instance,
    method: 'GET',
    path: '/api/v1/health',
    sendCookies: false,
  }).catch(() => null);

  if (ready?.status === 200 && ready.body?.status === 'ok') break;
  await sleep(500);
}

if (!(ready?.status === 200 && ready.body?.status === 'ok')) {
  stopPid(child.pid);
  fail(
    `Timed out waiting for GET /api/v1/health on ${baseUrl}.\n${tailLog(serverLogPath)}`,
  );
}

console.log(
  JSON.stringify(
    {
      status: 'started',
      baseUrl,
      pid: child.pid,
      database: VERIFY_DATABASE,
      health: ready.body,
      account: accountPath,
      artifacts: artifactsDir,
      logFile: serverLogPath,
    },
    null,
    2,
  ),
);
