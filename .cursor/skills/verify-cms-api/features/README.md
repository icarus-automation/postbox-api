# cms-api verification map

This directory is the maintained source for verifying the user-facing HTTP behavior of cms-api. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-cms-api/scripts/launch.mjs` so the API is at `http://127.0.0.1:18000` against database `cms_api_verify`.
- Run `node .cursor/skills/verify-cms-api/scripts/doctor.mjs` and require `status: "ok"`, `Hello World!`, and database `up`.
- Never drive an instance that was not started by this verification run. A developer server on port 8000 is off-limits.
- Disposable owner credentials live in `.cursor/skills/verify-cms-api/run/account.json`. There is no Prisma seed owner. Email sign-up is disabled. The sign-up recipe provisions a password fixture, then creates the workspace over HTTP.
- Start every recipe from this baseline unless its preconditions say otherwise (most mutations need the owner signed in first).

## Driving conventions

- Treat every `http.mjs` command as literal. Keep paths, JSON keys, and header names unchanged.
- Session routes use the cookie jar (default). Machine ingest uses `--api-key` or `--api-key-from`, never a browser `x-api-key`.
- Successful handlers return the resource with no success envelope. Errors are `{ statusCode, message, error, path, timestamp }`.
- Pagination for lead lists is `{ data, meta: { total, page, limit, lastPage } }` with default `page=1`, `limit=10`.
- After a mutation, restore fixture state (delete a custom field, restore an archived lead) without deleting proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final response.
- HTTP proof is the `http.mjs` JSON transcript: method, path, status, body.
- Mutation proof includes a second GET of the stored value.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-http` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Sign up and session](./sign-up-and-session.md) covers disabled email sign-up, a user with no organization, workspace creation, session cookies, and sign-in.
- [API keys](./api-keys.md) covers minting, listing without the raw secret, using `x-api-key`, and revoke.
- [Lead ingest](./lead-ingest.md) covers machine create, field lookup for dedupe, and the keys an agent is refused.
- [Lead inbox](./lead-inbox.md) covers session list, status, value edits, archive, and restore.
- [Lead fields](./lead-fields.md) covers system fields, custom fields, and the delete rules.
