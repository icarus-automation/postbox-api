# Sign up and session

Sign-up creates an email-and-password owner, a personal organization named `{name}'s organization`, and an HTTP-only session whose `activeOrganizationId` is already set. Clients never create or activate an organization themselves.

## Sub-features

- `signup-email` creates the user from `POST /api/v1/auth/sign-up/email`.
- `signup-org` leaves a personal organization on the new session.
- `signup-fields` seeds the seven lead system fields for that organization.
- `signin-email` issues a new session for the same owner.
- `session-required` keeps organization routes closed without a cookie.

## How to get to it (user POV)

- Submit email, password, and name to `POST /api/v1/auth/sign-up/email`.
- Read the current session from `GET /api/v1/auth/get-session`.
- Read the provisioned organization from `GET /api/v1/auth/organization/get-full-organization`.
- Submit the same email and password to `POST /api/v1/auth/sign-in/email`.
- Call any organization route with no `Cookie` header.

## Driving it with verify-http

Preconditions:

- Doctor reports the verification instance healthy at `http://127.0.0.1:18000`.
- `.cursor/skills/verify-cms-api/run/account.json` holds `name`, `email`, and `password` from launch.
- That email has not already signed up in `cms_api_verify`. If it has, launch again so a new account file is written.

- **Anonymous root.** `GET /api/v1` without a session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1 --no-cookies --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/hello.json`. Body is `Hello World!`.
- **Closed leads.** `GET /api/v1/leads` without a session or key. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --no-cookies --expect-status 401 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/leads-unauthenticated.json`.
- **Sign up.** Submit the launch account. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/auth/sign-up/email --body-file .cursor/skills/verify-cms-api/run/account.json --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/signup.json`. Body `user.email` matches `account.json`, and `run/cookies.json` now has a session cookie name.
- **Read session.** Ask Better Auth for the session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/auth/get-session --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/session.json`. `session.activeOrganizationId` is a non-empty string and `user.email` matches.
- **Read organization.** Load the full organization. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/auth/organization/get-full-organization --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/organization.json`. `name` is `{account.name}'s organization` and `members` includes this user with role `owner`.
- **System fields.** List lead fields with the session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/fields --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/fields.json`. Keys in order are `candidate`, `product`, `source`, `signal`, `whyLead`, `status`, `receivedAt`. `status` and `receivedAt` have `isReadOnly: true` and `isSystem: true`.
- **Sign in again.** Submit the same credentials. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/auth/sign-in/email --body-file .cursor/skills/verify-cms-api/run/account.json --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/signin.json`. Then run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/auth/get-session --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/session-after-signin.json`. `activeOrganizationId` matches `session.json`.
- **Proof.** Keep `signup.json`, `session.json`, `organization.json`, `fields.json`, and `session-after-signin.json`. Together they show the account, the active organization, the seeded fields, and that sign-in keeps the same organization. Do not treat a 200 from sign-up alone as proof the organization exists.

## Gotchas

- Sign-up without a running Nest application context does not provision an organization. This launch path starts the real app; `pnpm exec prisma db seed` is a different entry and is not this feature.
- Duplicate email fails. Launch writes a new `verify-<id>@cms-api.test` each time it actually starts a process; `already-running` reuses the existing account file.
- `account.json` contains only `name`, `email`, and `password`. Extra properties on that POST are rejected by Better Auth.
- Do not call organization create or set-active to "fix" a missing `activeOrganizationId`. That is a product failure, not a verification step.
- Session cookies are HTTP-only. The helper jar is the only way this skill holds them. `--no-cookies` is required to prove 401s after sign-up, because the jar would otherwise authenticate.
