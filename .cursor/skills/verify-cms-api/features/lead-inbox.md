# Lead inbox

A signed-in owner reads the organization's leads, moves status, edits writable values, and archives or restores. Archive is not a status: a restored lead returns at the stage it left on. The inbox and the archive are separate lists.

## Sub-features

- `inbox-list` returns paginated inbox leads, newest first.
- `inbox-get` returns one lead by id.
- `inbox-status` sets `status` to `new`, `contacted`, or `qualified` through `PATCH /api/v1/leads/:id/status`.
- `inbox-values` patches writable values without moving status.
- `inbox-archive` sets `isArchived` through `PATCH /api/v1/leads/:id/archive` and splits inbox vs `archived=true`.

## How to get to it (user POV)

- `GET /api/v1/leads` (inbox) or `GET /api/v1/leads?archived=true` (archive) on a session.
- `GET /api/v1/leads/:id` on a session.
- `PATCH /api/v1/leads/:id/status` with `{ "status": "contacted" }`.
- `PATCH /api/v1/leads/:id` with `{ "values": { ... } }`.
- `PATCH /api/v1/leads/:id/archive` with `{ "isArchived": true }` or `false`.

## Driving it with verify-http

Preconditions:

- Doctor is healthy.
- The launch owner is signed in.
- A lead exists in this organization, filed through [Lead ingest](./lead-ingest.md). Note its `LEAD_ID` and current `status` (expect `new`).

- **Inbox list.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/list.json`. `data` contains `LEAD_ID`. `meta.total` is at least 1.
- **Get one.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/LEAD_ID --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/get.json`. `isArchived` is `false`.
- **Move status.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID/status --json status=contacted --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/status.json`. `values.status` is `contacted`. GET the lead again; status is still `contacted`.
- **Refuse status via values.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID --json values.status=qualified --expect-status 400 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/status-via-values.json`. `message` includes `values.status is read-only`. Status stays `contacted`.
- **Edit a writable field.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID --json "values.signal=Followed up by phone" --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/values.json`. `values.signal` is the new text and `values.status` is still `contacted`.
- **Archive.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID/archive --json isArchived=true --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/archive.json`. `isArchived` is `true`, `values.status` is still `contacted`.
- **Split lists.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/inbox-after-archive.json`. `data` does not include `LEAD_ID`. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --query archived=true --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/archive-list.json`. `data` includes `LEAD_ID`. `archived=yes` is 400.
- **Restore.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/LEAD_ID/archive --json isArchived=false --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-inbox/restore.json`. Inbox GET contains it again; `values.status` is still `contacted`.
- **Proof.** `status.json`, `archive.json`, `inbox-after-archive.json`, `archive-list.json`, and `restore.json`. Status must survive archive. A single GET after archive is not proof the inbox and archive are split.

## Gotchas

- These routes are session-only. An API key 401s; that refusal belongs to [Lead ingest](./lead-ingest.md), but a session proof that accidentally used `--api-key-from` and `--no-cookies` will fail.
- `archived` is not a boolean JSON query. The API accepts the strings `true` and `false` only.
- Any status may follow any other; there is no workflow guard. Assert the value you set, not a transition table.
- `GET /api/v1/leads?status=contacted` filters the current list (inbox or archive), it does not mix them.
- `limit` max is 50. Default page size is 10.
