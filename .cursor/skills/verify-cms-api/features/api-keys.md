# API keys

An owner or admin session mints a long-lived organization API key. The raw secret is returned once. Machines send it as `x-api-key`. Revoke disables the key; listing never returns the secret.

## Sub-features

- `apikey-mint` creates a named key and returns `key` once, prefixed `cms_`.
- `apikey-list` lists keys with `name`, `keyPrefix`, and `revokedAt`, not `key`.
- `apikey-use` authorizes `GET /api/v1/leads` with `x-api-key`.
- `apikey-revoke` disables the key and a later revoke keeps the first `revokedAt`.
- `apikey-revoked-use` rejects the raw secret after revoke.

## How to get to it (user POV)

- `POST /api/v1/api-keys` with `{ "name": "<name>" }` on an owner or admin session.
- `GET /api/v1/api-keys` on that session.
- Send `x-api-key: cms_...` to a machine-readable route such as `GET /api/v1/leads`.
- `DELETE /api/v1/api-keys/:id` on that session.

## Driving it with verify-http

Preconditions:

- Doctor is healthy.
- The launch owner is signed in (cookie jar from [Sign up and session](./sign-up-and-session.md)).
- No working transcript yet at `run/create-key.json`.

- **Mint.** Create a key named `verify-agent`. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/api-keys --json name=verify-agent --expect-status 201 --redact key --out-raw .cursor/skills/verify-cms-api/run/create-key.json --out .cursor/skills/verify-cms-api/artifacts/api-keys/mint.json`. Raw `body.key` in `run/create-key.json` starts with `cms_`. The artifact has `<redacted>` instead. `body.name` is `verify-agent` and `body.revokedAt` is `null`.
- **List without secret.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/api-keys --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/api-keys/list.json`. The minted id is present with `keyPrefix` set and no `key` property.
- **Use as a machine.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/api-keys/leads-with-key.json`. Body has `data` and `meta`. Repeat without `--api-key-from` and with `--no-cookies`; expect 401.
- **Revoke.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs DELETE /api/v1/api-keys/KEY_ID --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/api-keys/revoke.json`, substituting `KEY_ID` from the mint body. `revokedAt` is a timestamp.
- **Revoke again.** Repeat the same DELETE. `revokedAt` equals the first revocation time.
- **Refused after revoke.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --expect-status 401 --out .cursor/skills/verify-cms-api/artifacts/api-keys/revoked-use.json`.
- **Proof.** `mint.json` (redacted), `list.json`, `leads-with-key.json`, and `revoked-use.json`. A list row is not proof the secret worked; the leads GET with `--no-cookies` and `--api-key-from` is.

## Gotchas

- `POST /api/v1/api-keys` is session-only. An `x-api-key` cannot mint another key.
- The raw key is unreadable after mint. If `run/create-key.json` is lost, mint a new key; do not query the database hash.
- Browsers cannot send `x-api-key` (`main.ts` CORS `allowedHeaders` are `Content-Type` and `Authorization` only). Proving a browser request with that header is out of scope; this harness is the machine caller.
- `member` cannot manage keys. This map's owner session can. Do not invent a second user unless you are extending the map.
- Nest rate-limits 100 requests per 60 seconds. Stay under that in a single drive.
