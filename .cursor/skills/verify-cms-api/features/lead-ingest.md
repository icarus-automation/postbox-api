# Lead ingest

Machines file leads with an organization API key. Every lead starts as `new`. The same key can read fields and look up an existing lead before posting another.

## Sub-features

- `ingest-fields` reads `GET /api/v1/leads/fields` with the API key.
- `ingest-create` posts required writable values to `POST /api/v1/leads`.
- `ingest-read` fetches the created lead by id with the same key.
- `ingest-dedupe` looks up by exact field value (`field` + `value` query).
- `ingest-refused` rejects unknown keys, read-only `status`, missing keys, and session-only writes.

## How to get to it (user POV)

- `GET /api/v1/leads/fields` with `x-api-key`.
- `POST /api/v1/leads` with `{ "values": { ... } }` and `x-api-key`.
- `GET /api/v1/leads/:id` with `x-api-key`.
- `GET /api/v1/leads?field=<key>&value=<exact>` with `x-api-key`.
- Attempt `PATCH /api/v1/leads/:id/status`, `PATCH /api/v1/leads/:id/archive`, `PATCH /api/v1/leads/:id`, or `POST /api/v1/leads/fields` with only the API key.

## Driving it with verify-http

Preconditions:

- Doctor is healthy.
- A working key transcript exists at `run/create-key.json` from [API keys](./api-keys.md).
- System fields are the defaults. Required writable keys are `candidate`, `product`, `source`, `signal`, `whyLead`. `product` is one of `POS`, `PMS`, `Other`.
- Choose a unique `source` URL that includes the account email local-part so a rerun does not collide with leftover leads in `cms_api_verify`.

- **Read the schema.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/fields --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/fields.json`. The seven system keys are present.
- **Missing key.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --json values.candidate=Dana --expect-status 400 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/missing-required.json`. `message` lists the other required keys.
- **Unknown key.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --json values.candidate=Dana --json values.product=POS --json values.source=https://example.com/ingest --json values.signal=hi --json values.whyLead=why --json values.budget=1 --expect-status 400 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/unknown-key.json`. `message` includes `values.budget is not a lead field`.
- **File a lead.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --json "values.candidate=Dana Reyes" --json values.product=POS --json values.source=https://example.com/leads/SOURCE --json "values.signal=Asked about POS pricing" --json "values.whyLead=Store owner comparing vendors" --expect-status 201 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/create.json`, substituting a unique `SOURCE`. `values.status` is `new`. `values.receivedAt` is an ISO timestamp. `isArchived` is `false`.
- **Read it back.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/LEAD_ID --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/get.json`, substituting `LEAD_ID` from create. Candidate and source match.
- **Dedupe lookup.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --query field=source --query value=https://example.com/leads/SOURCE --query limit=1 --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/dedupe.json`. `data[0].id` is that lead. A lookup on `field=externalId` is 400 `field externalId is not a lead field`.
- **Agents cannot advance it.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID/status --api-key-from .cursor/skills/verify-cms-api/run/create-key.json --no-cookies --json status=contacted --expect-status 401 --out .cursor/skills/verify-cms-api/artifacts/lead-ingest/status-refused.json`. Repeat for `PATCH /api/v1/leads/LEAD_ID` with `--json values.signal=nope`, `PATCH /api/v1/leads/LEAD_ID/archive` with `--json isArchived=true`, and `POST /api/v1/leads/fields` with `--json key=dealSize --json label=Deal --json type=number`. All 401.
- **Proof.** `create.json`, `get.json`, and `dedupe.json` share the same id and source. `status-refused.json` is 401. Filing without `x-api-key` (`--no-cookies` and no `--api-key-from`) is 401.

## Gotchas

- `source` must be an `http` or `https` URL. A bare hostname 400s.
- `product` is a select. `pos` (wrong case) 400s; `POS` succeeds.
- `status` and `receivedAt` are read-only on values writes. Including them on POST 400s with `values.status is read-only`.
- `GET /api/v1/leads` defaults to the inbox (`archived=false`). An ingest proof that then archives the lead will not see it on the default list.
- `field` and `value` must be sent together for lookup. Sending only one 400s.
- POST without a key does not call key verification; the 401 message is `Missing API key`.
