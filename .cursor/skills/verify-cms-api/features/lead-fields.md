# Lead fields

Each organization has lead field definitions. Sign-up seeds system fields that cannot be deleted. An owner or admin adds custom fields; members may read the list with a session or an API key.

## Sub-features

- `fields-list` returns definitions ordered by `position`.
- `fields-create` adds a custom field (`text`, `long_text`, `number`, `select`, `url`, `date`).
- `fields-update` changes label, `isRequired`, `options`, or `position` without changing `key` or `type`.
- `fields-delete-custom` deletes a non-system field.
- `fields-delete-system` refuses to delete a system field.

## How to get to it (user POV)

- `GET /api/v1/leads/fields` with a session or `x-api-key`.
- `POST /api/v1/leads/fields` with `{ "key", "label", "type" }` and `options` when `type` is `select`.
- `PATCH /api/v1/leads/fields/:id` with the properties to change.
- `DELETE /api/v1/leads/fields/:id`.

## Driving it with verify-http

Preconditions:

- Doctor is healthy.
- The launch owner is signed in.
- No custom field with key `dealSize` exists yet in this organization. If a previous run left one, delete it first or pick another camelCase key.

- **List system fields.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/fields --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/list.json`. Seven system rows, keys `candidate`, `product`, `source`, `signal`, `whyLead`, `status`, `receivedAt`. Note `status.id`.
- **Create custom.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/leads/fields --json key=dealSize --json "label=Deal size" --json type=number --expect-status 201 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/create.json`. `isSystem` is `false`, `key` is `dealSize`. Duplicate POST is 409 `Lead field dealSize already exists`.
- **Select needs options.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/leads/fields --json key=tier --json label=Tier --json type=select --expect-status 400 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/select-without-options.json`. Then create it with `--json options=A` after fixing the body to a JSON array via `--body-file` containing `{"key":"tier","label":"Tier","type":"select","options":["A","B"]}`.
- **Update label.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs PATCH /api/v1/leads/fields/FIELD_ID --json label=Deal --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/update.json`, substituting the `dealSize` id. `key` is still `dealSize`.
- **Refuse system delete.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs DELETE /api/v1/leads/fields/STATUS_ID --expect-status 409 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/delete-system.json`. Message includes `status is a system field and cannot be deleted`. GET fields still includes `status`.
- **Delete custom.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs DELETE /api/v1/leads/fields/FIELD_ID --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/lead-fields/delete-custom.json`. GET fields no longer includes `dealSize`.
- **Machine cannot manage.** With `--api-key-from run/create-key.json --no-cookies`, POST and DELETE fields are 401. GET fields is 200.
- **Proof.** `create.json`, `delete-system.json`, and a GET list after each delete. A 201 without a follow-up list is not proof the field is readable or that system fields survived.

## Gotchas

- `key` must match `^[a-z][a-zA-Z0-9]*$`. `deal_size` and `DealSize` 400.
- `datetime` is not allowed on custom fields.
- `options` are required on `select` and forbidden on other types.
- Read-only system fields (`status`, `receivedAt`) may change `label` and `position` only. Changing `options` or `isRequired` 400s.
- Deleting a custom field also deletes stored values for that key on every lead. Do that after ingest proofs, not before.
- `--json options=A` cannot build an array. Use `--body-file` for `options`.
