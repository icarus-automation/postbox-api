# Backend Boilerplate Agent Guide

This file is the canonical repository guidance for coding agents. Tool-specific files may reference it but must not duplicate project rules.

## Product

The API behind a CMS for the owner's own sites and agents today, headed for a public multi-tenant SaaS. Two kinds of caller: a browser client on a cookie session, and machines (agents, n8n, Postman) on an API key.

Phase 1 domain is leads. Machines post them to `POST /api/v1/leads`, the owner reads them and sets their status in the client. `docs/fe-phase1-api.md` and `docs/fe-lead-fields-api.md` are the contracts the client repo builds against. Keep them true when routes or fields change.

Record attributes come from organization-scoped field definitions per collection (`FieldDefinition`, only `lead` wired so far). System fields ship with every organization and cannot be deleted, and admins add custom ones. A lead stores one `LeadValue` row per filled field, and every write is checked against the definitions, refusing unknown and read-only keys. Organization provisioning seeds the system fields from `src/modules/leads/lead-system-fields.ts`.

## Stack

- Node.js 22.22.1 or newer and pnpm 12
- NestJS 11 and TypeScript 5
- PostgreSQL and Prisma 7
- Better Auth with the organization plugin
- Jest 30 and ESLint 10

## Repository Map

- `src/modules`: business features such as auth, users, api keys and leads
- `src/core`: infrastructure, configuration, database, health, and security
- `src/common`: shared transport concerns with no feature-specific business logic
- `prisma/schema.prisma`: database model
- `prisma/migrations`: committed, append-only migration history
- `test`: HTTP-level tests
- `docs`: contracts published to other repos

## Package Management

- Use pnpm exclusively.
- Run local tools with `pnpm exec`.
- Commit `pnpm-lock.yaml` with dependency changes.
- Keep dependency overrides and build permissions in `pnpm-workspace.yaml`.
- Never hand-edit `pnpm-lock.yaml` or generated Prisma Client files.

## Architecture

- Organize code by feature.
- Keep controllers thin. Put business rules in services.
- Reuse the shared `PrismaService` singleton in Better Auth and inject it everywhere else.
- Reuse existing modules and patterns before adding abstractions.
- Avoid blanket try-catch blocks. Nest exception handling owns transport errors.
- Make clean cutovers. Update every caller and remove obsolete paths.

## API Contracts

- Public HTTP routes use the `/api/v1` prefix.
- Successful handlers return plain resources without a success envelope.
- `HttpExceptionFilter` owns the shared error response format.
- Global validation strips unknown properties, rejects non-whitelisted fields, and transforms values.
- Name `@Body()` parameters `body`.
- Use domain-specific operation names and explicit public return types.
- Use `async` only when the method awaits work or needs async error handling.

## Authentication Invariants

- Better Auth owns email and password authentication under `/api/v1/auth`.
- The Better Auth integration guard is global. Mark public Nest routes with `@AllowAnonymous()`.
- Browser authentication uses HTTP-only session cookies.
- Users can belong to one organization. Hooks reject extra memberships and `Member.userId` stays unique.
- Sign-up provisions that organization, named `{user}'s organization`, and every session carries it as `activeOrganizationId`. Clients never call organization create or set-active. See `src/modules/auth/organization-provisioning.ts`.
- Better Auth runs `user.create.after` only once the sign-up transaction commits, which is after the sign-up session row exists. Provisioning backfills that session instead of assuming hook order.
- Organization-scoped controllers require `@OrgRoles()` or `@MemberHasPermission()`.
- Scope every tenant query by the authenticated session's `activeOrganizationId`.
- Never return or log account password hashes. Never log session tokens.
- `main.ts` owns CORS. Allowed headers are `Content-Type` and `Authorization` only, so a browser cannot send `x-api-key`. Keep it that way.
- Machine callers authenticate with a long-lived API key in the `x-api-key` header. `ApiKeyGuard` owns that check, and those routes carry `@AllowAnonymous()` so the session guard steps aside. Lead reads (`GET /api/v1/leads`, `/leads/:id`, `/leads/fields`) take a session or a key through `@SessionOrApiKey()`, so agents can dedupe before posting.
- API keys are stored as SHA-256 hashes. Creation returns the raw key once and nothing reads it again. Never return or log a raw key or a key hash.
- Keys are minted over HTTP by an `owner` or `admin` session. There is no key admin UI.
- An API key carries its own organization. Scope machine reads and writes by the key organization, never by a session.
- Leads start as `new`, and only a session moves them, through `PATCH /api/v1/leads/:id/status`. Never open that route to an API key, because agents must not advance a lead. `status` stays a read-only lead field so no values write can move it.

## Prisma Rules

- Use camelCase model fields and map existing snake_case database names with `@map` and `@@map`.
- Create a new migration for schema changes. Never rewrite an applied migration.
- Regenerate Prisma Client after schema changes.
- Use explicit safe selections when a model contains sensitive fields.
- Use `prisma migrate dev` locally and `prisma migrate deploy` in deployments.

## Verification

Use the smallest relevant check while editing. Before completion, run the applicable baseline:

```bash
pnpm exec prisma validate
pnpm exec eslint "src/**/*.ts" "test/**/*.ts" prisma.config.ts
pnpm exec tsc -p tsconfig.build.json --noEmit
pnpm test --runInBand
```

Run `pnpm test:e2e` for changed HTTP or application wiring behavior. Supply the required environment and PostgreSQL instance.

For dependency installation and Prisma generation:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
```

## Definition of Done

- Requested behavior works end to end.
- Affected callers, tests, configuration, and documentation agree.
- New observable contracts have focused regression coverage.
- No placeholders, compatibility aliases, dead code, or unrelated refactors remain.
- Relevant verification commands pass.
