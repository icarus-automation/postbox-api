# Sign up and session

Email and password sign-up is rejected. Sign-in still accepts email and password. A new user has no organization until they create one. That call makes them the owner and seeds the lead system fields. Google is the product sign-up. This recipe inserts a password fixture only because the harness cannot complete Google consent, then proves the HTTP behavior from there.

## Sub-features

- `signup-email` rejects `POST /api/v1/auth/sign-up/email` with `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- `signup-org` leaves a new signed-in user with no organization.
- `workspace-create` creates the organization, makes the caller `owner`, and seeds lead system fields.
- `signin-email` issues a new session for the same owner and keeps that organization.
- `session-required` keeps organization routes closed without a cookie.

## How to get to it (user POV)

- Submit email, password, and name to `POST /api/v1/auth/sign-up/email` and receive a rejection.
- Sign in with `POST /api/v1/auth/sign-in/email`.
- Read `GET /api/v1/workspaces/admission`. No membership means `phase` is `onboarding`.
- Create the workspace with `POST /api/v1/workspaces`.
- Read the current session from `GET /api/v1/auth/get-session`.
- Call any organization route with no `Cookie` header.

## Driving it with verify-http

Preconditions:

- Doctor reports the verification instance healthy at `http://127.0.0.1:18000`.
- `.cursor/skills/verify-cms-api/run/account.json` holds `name`, `email`, and `password` from launch.
- That email has not already been provisioned in `cms_api_verify`. If it has, launch again so a new account file is written.

- **Anonymous root.** `GET /api/v1` without a session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1 --no-cookies --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/hello.json`. Body is `Hello World!`.
- **Closed leads.** `GET /api/v1/leads` without a session or key. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads --no-cookies --expect-status 401 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/leads-unauthenticated.json`.
- **Reject email sign-up.** Submit the launch account. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/auth/sign-up/email --body-file .cursor/skills/verify-cms-api/run/account.json --no-cookies --expect-status 400 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/signup.json`. Body `code` is `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- **Fixture user.** Insert the password account with no organization. Run `node .cursor/skills/verify-cms-api/scripts/provision-owner.mjs --database verify`. Stdout is `created email=...`. This is not a product sign-up.
- **Sign in with no organization.** Submit the same credentials. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/auth/sign-in/email --body-file .cursor/skills/verify-cms-api/run/account.json --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/signin-first.json`. Then run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/workspaces/admission --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/admission-before.json`. `phase` is `onboarding`.
- **Create the workspace.** Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/workspaces --json name=Verify --json slug=verify-owner --json website=null --expect-status 201 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/workspace.json`. `role` is `owner` and `slug` is `verify-owner`. If that slug is taken, pick another canonical slug and use it in the reads below.
- **Read session.** Ask Better Auth for the session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/auth/get-session --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/session.json`. `session.activeOrganizationId` is a non-empty string and `user.email` matches.
- **System fields.** List lead fields with the session. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/leads/fields --expect-status 200 --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/fields.json`. Keys in order are `candidate`, `product`, `source`, `signal`, `whyLead`, `status`, `receivedAt`. `status` and `receivedAt` have `isReadOnly: true` and `isSystem: true`.
- **Sign in again.** Submit the same credentials. Run `node .cursor/skills/verify-cms-api/scripts/http.mjs POST /api/v1/auth/sign-in/email --body-file .cursor/skills/verify-cms-api/run/account.json --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/signin.json`. Then run `node .cursor/skills/verify-cms-api/scripts/http.mjs GET /api/v1/auth/get-session --expect-status 200 --redact token --out .cursor/skills/verify-cms-api/artifacts/sign-up-and-session/session-after-signin.json`. `activeOrganizationId` matches `session.json`.
- **Proof.** Keep `signup.json`, `admission-before.json`, `workspace.json`, `fields.json`, and `session-after-signin.json`. Together they show email sign-up rejected, a user with no organization, the created workspace, the seeded fields, and that sign-in keeps the same organization.

## Gotchas

- Do not call `POST /api/v1/auth/organization/create`. The browser is not allowed to create an organization there. `POST /api/v1/workspaces` is the product create.
- `provision-owner.mjs` writes a credential user into `cms_api_verify`. It does not create an organization. `--database dev` writes the developer's `.env` database and is for the client harness, not this recipe.
- Duplicate email fails on a second provision. Launch writes a new `verify-<id>@cms-api.test` each time it starts a process. `already-running` reuses the existing account file.
- `account.json` contains only `name`, `email`, and `password`. Extra properties on the sign-up POST are rejected by Better Auth.
- The workspace slug is chosen once. A later profile save must not send a different slug.
- Session cookies are HTTP-only. The helper jar is the only way this skill holds them. `--no-cookies` is required to prove 401s, because the jar would otherwise authenticate.
