#!/usr/bin/env node
import { rmSync } from 'node:fs';

import {
  cookiesPath,
  instancePath,
  pidAlive,
  portStatus,
  readInstance,
  runDir,
  sleep,
  stopPid,
} from './lib.mjs';

const instance = readInstance();
if (instance?.pid) {
  stopPid(instance.pid);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const alive = pidAlive(instance.pid);
    const open = (await portStatus(instance.port)) === 'open';
    if (!alive && !open) break;
    await sleep(200);
  }
}

rmSync(instancePath, { force: true });
rmSync(cookiesPath, { force: true });

console.log(
  JSON.stringify(
    {
      status: 'cleaned',
      stoppedPid: instance?.pid ?? null,
      kept: {
        artifacts: 'artifacts stay on disk',
        database: 'cms_api_verify is left in place for the next launch',
        account: 'run/account.json is left so a proof can name the user',
        runDir,
      },
    },
    null,
    2,
  ),
);
