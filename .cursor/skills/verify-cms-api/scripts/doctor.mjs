#!/usr/bin/env node
import {
  VERIFY_KIND,
  accountPath,
  pidAlive,
  portStatus,
  requireInstance,
  requestJson,
  serverLogPath,
  tailLog,
} from './lib.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const instance = requireInstance();

if (!pidAlive(instance.pid)) {
  fail(
    `Registered pid ${instance.pid} is not running. Run cleanup.mjs, then launch.mjs.`,
  );
}

if ((await portStatus(instance.port)) !== 'open') {
  fail(
    `Pid ${instance.pid} is alive but ${instance.baseUrl} is not accepting connections.\n${tailLog(serverLogPath)}`,
  );
}

const hello = await requestJson({
  instance,
  method: 'GET',
  path: '/api/v1',
  sendCookies: false,
}).catch((error) => fail(`GET /api/v1 failed: ${error.message}`));

const health = await requestJson({
  instance,
  method: 'GET',
  path: '/api/v1/health',
  sendCookies: false,
}).catch((error) => fail(`GET /api/v1/health failed: ${error.message}`));

const problems = [];
if (hello.status !== 200 || hello.body !== 'Hello World!') {
  problems.push(
    `GET /api/v1 expected 200 Hello World!, got ${hello.status} ${JSON.stringify(hello.body)}`,
  );
}
if (health.status !== 200 || health.body?.status !== 'ok') {
  problems.push(
    `GET /api/v1/health expected status ok, got ${health.status} ${JSON.stringify(health.body)}`,
  );
}
if (health.body?.details?.database?.status !== 'up') {
  problems.push(
    `database is not up: ${JSON.stringify(health.body?.details?.database)}`,
  );
}
if (instance.kind !== VERIFY_KIND) {
  problems.push('instance.json is not a verify-cms-api registration');
}

if (problems.length > 0) {
  fail(problems.join('\n'));
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      kind: instance.kind,
      pid: instance.pid,
      baseUrl: instance.baseUrl,
      database: instance.database,
      health: health.body,
      account: accountPath,
    },
    null,
    2,
  ),
);
