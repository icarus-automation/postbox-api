#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  parseJsonFields,
  readJson,
  redactValue,
  requestJson,
  requireInstance,
} from './lib.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function takeFlag(args, name) {
  const values = [];
  for (let i = 0; i < args.length; ) {
    if (args[i] === name) {
      const value = args[i + 1];
      if (value === undefined) fail(`${name} needs a value`);
      values.push(value);
      args.splice(i, 2);
      continue;
    }
    if (args[i].startsWith(`${name}=`)) {
      values.push(args[i].slice(name.length + 1));
      args.splice(i, 1);
      continue;
    }
    i += 1;
  }
  return values;
}

function takeSwitch(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

const args = process.argv.slice(2);
const expectStatus = takeFlag(args, '--expect-status').at(-1);
const outPath = takeFlag(args, '--out').at(-1);
const outRawPath = takeFlag(args, '--out-raw').at(-1);
const redactKeys = (takeFlag(args, '--redact').at(-1) || '')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);
const bodyFile = takeFlag(args, '--body-file').at(-1);
const jsonFields = takeFlag(args, '--json');
const queryFields = takeFlag(args, '--query');
const headerFields = takeFlag(args, '--header');
const apiKey = takeFlag(args, '--api-key').at(-1);
const apiKeyFrom = takeFlag(args, '--api-key-from').at(-1);
const noCookies = takeSwitch(args, '--no-cookies');

const method = args.shift();
const path = args.shift();
if (!method || !path) {
  fail(
    'Usage: node http.mjs METHOD /path [--json key=value] [--body-file file] [--query key=value] [--header Name:value] [--api-key cms_...] [--api-key-from file] [--no-cookies] [--expect-status 200] [--out file] [--out-raw file] [--redact key,token]',
  );
}
if (args.length > 0) fail(`Unexpected arguments: ${args.join(' ')}`);
if (!path.startsWith('/')) fail('Path must start with /');

let body;
if (bodyFile) {
  const absolute = resolve(process.cwd(), bodyFile);
  body = JSON.parse(readFileSync(absolute, 'utf8'));
}
if (jsonFields.length > 0) {
  body = { ...(body && typeof body === 'object' ? body : {}), ...parseJsonFields(jsonFields) };
}

const extraHeaders = {};
for (const header of headerFields) {
  const colon = header.indexOf(':');
  if (colon === -1) fail(`--header needs Name: value, got ${header}`);
  extraHeaders[header.slice(0, colon).trim()] = header.slice(colon + 1).trim();
}

if (apiKey) extraHeaders['x-api-key'] = apiKey;
if (apiKeyFrom) {
  const created = readJson(resolve(process.cwd(), apiKeyFrom), null);
  const key = created?.body?.key;
  if (!key) fail(`--api-key-from ${apiKeyFrom} has no body.key`);
  extraHeaders['x-api-key'] = key;
}

let requestPath = path;
if (queryFields.length > 0) {
  const params = new URLSearchParams();
  for (const field of queryFields) {
    const eq = field.indexOf('=');
    if (eq === -1) fail(`--query needs key=value, got ${field}`);
    params.append(field.slice(0, eq), field.slice(eq + 1));
  }
  requestPath = `${path}?${params.toString()}`;
}

const instance = requireInstance();
const result = await requestJson({
  instance,
  method: method.toUpperCase(),
  path: requestPath,
  body,
  extraHeaders,
  sendCookies: !noCookies,
});

if (outRawPath) {
  const absolute = resolve(process.cwd(), outRawPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
}

const recorded = redactKeys.length > 0 ? redactValue(result, redactKeys) : result;
const encoded = `${JSON.stringify(recorded, null, 2)}\n`;
process.stdout.write(encoded);

if (outPath) {
  const absolute = resolve(process.cwd(), outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, encoded);
}

if (expectStatus !== undefined && String(result.status) !== String(expectStatus)) {
  fail(`Expected status ${expectStatus}, got ${result.status}`);
}
