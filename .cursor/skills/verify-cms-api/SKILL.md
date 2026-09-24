---
name: verify-cms-api
description: Drive the cms-api HTTP surface at /api/v1 the way a browser cookie session or a machine API key would. Use when proving sign-up, sessions, API keys, lead ingest, the lead inbox, or lead fields against a live local instance.
---

# Verify cms-api

cms-api is a NestJS HTTP API. There is no first-party web UI in this repo. Callers are a browser client on an HTTP-only cookie session, and machines (agents, n8n, Postman) on `x-api-key`.

This skill launches an isolated instance, talks to the real `/api/v1` routes, and captures request/response proof. Unit tests and `pnpm test:e2e` mock Prisma or Better Auth; they are not this proof.

## Launch

From the repository root. Requires Node.js 22.22.1+, pnpm 12, a filled-in `.env`, and PostgreSQL reachable at `DATABASE_URL`.

```bash
node .cursor/skills/verify-cms-api/scripts/launch.mjs
```

What it does:

- Refuses to attach to whatever is already listening on port 8000 (or any other process this skill did not start).
- Listens on `127.0.0.1:18000` (`VERIFY_PORT` overrides).
- Creates PostgreSQL database `cms_api_verify` on the same server as `.env`'s `DATABASE_URL`, then runs `pnpm exec prisma migrate deploy` against it.
- Compiles with Nest (`nest build`) and runs `dist/main.js` (not `--watch`) with `PORT`, `DATABASE_URL`, and `BETTER_AUTH_URL` overridden. Ready when `GET /api/v1/health` returns `{ "status": "ok" }` and `details.database.status` is `up`.
- Writes `.cursor/skills/verify-cms-api/run/instance.json` and a disposable owner in `run/account.json`.

If launch reports `already-running`, the registered instance is healthy; skip to Doctor.

Teardown:

```bash
node .cursor/skills/verify-cms-api/scripts/cleanup.mjs
```

Never kill by process name. Cleanup stops the pid recorded in `instance.json`.

Two verification instances cannot share port 18000. They can share the `cms_api_verify` database; each launch mints a new `verify-<id>@cms-api.test` owner so runs do not reuse a session. Do not point this harness at the developer's usual `PORT=8000` database.

## Doctor

Run this first whenever anything looks off, and before the first drive of a session:

```bash
node .cursor/skills/verify-cms-api/scripts/doctor.mjs
```

It is read-only. It fails unless all of these hold:

- `run/instance.json` exists and `kind` is `verify-cms-api`
- that pid is alive
- that port accepts connections
- `GET /api/v1` is `200` with body `Hello World!`
- `GET /api/v1/health` is `200` with `status: "ok"` and database `up`

If doctor fails, cleanup then launch. Do not fall back to another port.

## Drive

Harness: `http.mjs`. It sends `Origin` from the instance base URL, replays Better Auth session cookies from `run/cookies.json`, and prints a JSON transcript (status, path, body). Cookie values are not written to `--out` files as raw `Set-Cookie` headers; only cookie names are.

```bash
node .cursor/skills/verify-cms-api/scripts/http.mjs METHOD /path [flags]
```

Flags:

| Flag | Purpose |
| --- | --- |
| `--json key=value` | Build or merge a JSON body. Dotted keys nest (`values.candidate=Dana`). Quote the whole `key=value` when the value has spaces. |
| `--body-file path` | Read a JSON body from a file. Launch writes `run/account.json` for sign-up. |
| `--query key=value` | Add a query string. Keep `archived=true` as the string `true`. |
| `--header Name:value` | Extra header. |
| `--api-key cms_...` | Set `x-api-key`. CORS forbids browsers from sending this; the helper is a machine caller. |
| `--api-key-from file` | Read `body.key` from a previous create-key transcript. |
| `--no-cookies` | Do not send the session jar (unauthenticated checks). |
| `--expect-status N` | Exit non-zero on mismatch. |
| `--out path` | Write the (possibly redacted) transcript. |
| `--out-raw path` | Write the full transcript, including secrets. Use only under `run/`. |
| `--redact key,token` | Replace named JSON keys with `<redacted>` in stdout and `--out`. Always redact `key`, `token`, and `password` when writing under `artifacts/`. |

Stable handles are route paths, status codes, and JSON keys. There are no ARIA roles.

Browser-session routes need the cookie jar (default). Machine routes that use `ApiKeyGuard` need `--api-key` or `--api-key-from`, plus `@AllowAnonymous()` on the Nest handler so the session guard steps aside. Routes that are session-only ignore `x-api-key` and return 401 without a cookie.

Do not call `POST /api/v1/auth/organization/create` or `POST /api/v1/auth/organization/set-active`. Sign-up provisions the organization and backfills `activeOrganizationId`.

Read `features/README.md` and the matching feature file before driving. A proof that uses one convenient entry point is incomplete when that file lists others.

## Evidence

Put transcripts in `.cursor/skills/verify-cms-api/artifacts/<feature-id>/`. Cleanup must not delete that tree.

Proof standards:

- Exercise the public `/api/v1` path a client or machine would call. Do not prove a write by poking Prisma, seed SQL, or an internal setter.
- Capture the mutating request and a second read of the resulting state (for example POST lead, then GET by id, then GET the list).
- Confirm side effects the body cannot fake: sign-up must show `session.activeOrganizationId`; a minted key must actually authorize `GET /api/v1/leads`; archiving must empty the inbox and fill `GET /api/v1/leads?archived=true`.
- Never log or leave a raw API key, session token, or password in `artifacts/`. Keep working secrets in `run/` (gitignored). Redact `key`, `token`, and `password`.
- `pnpm test` / `pnpm test:e2e` are not evidence for this skill.

Record the feature id and the exact `http.mjs` invocation in the artifact file names or a sibling `proof.txt`.

## Cleanup

```bash
node .cursor/skills/verify-cms-api/scripts/cleanup.mjs
```

Stops the launched pid (process tree on Windows via `taskkill /T`), waits until port 18000 is free, and deletes `run/instance.json` and `run/cookies.json`. It leaves:

- `artifacts/` (proof)
- `cms_api_verify` (next launch reuses it and applies migrations)
- `run/account.json` (so a proof can name the owner email)

Do not `taskkill` `node.exe` by name; that would hit the developer's app on port 8000.

## Helpers

All paths are relative to the repository root.

```bash
node .cursor/skills/verify-cms-api/scripts/launch.mjs
node .cursor/skills/verify-cms-api/scripts/doctor.mjs
node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/health --expect-status 200
node .cursor/skills/verify-cms-api/scripts/cleanup.mjs
```

`VERIFY_PORT` is the only supported launch override. Do not override `DATABASE_URL` to the developer's `cms` (or `backend_boilerplate`) database.
