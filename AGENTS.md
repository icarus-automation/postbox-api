# Backend Boilerplate Agent Guide

This file is the canonical repository guidance for coding agents. Tool-specific files may reference it but must not duplicate project rules.

## Product

The API behind a CMS for the owner's own sites and agents today, headed for a public multi-tenant SaaS. Two kinds of caller: a browser client on a cookie session, and machines (agents, n8n, Postman) on an API key.

Phase 1 domain is leads. Machines post them to `POST /api/v1/leads`, the owner reads them and sets their status in the client. `docs/fe-phase1-api.md` and `docs/fe-lead-fields-api.md` are the contracts the client repo builds against. Keep them true when routes or fields change.

The blog is the second domain. A post is a list of blocks, filed under at most one category and any number of tags, all scoped to the organization. A person writes and publishes in the client, and agents can file drafts with an API key. Websites read published posts, categories and tags with a public key under `/api/v1/public/:orgSlug/blog`. `docs/public-content-api.md` is that contract. Keep it true when those routes, fields or webhook events change.

Record attributes come from organization-scoped field definitions per collection (`FieldDefinition`, only `lead` wired so far). System fields ship with every organization and cannot be deleted, and admins add custom ones. A lead stores one `LeadValue` row per filled field, and every write is checked against the definitions, refusing unknown and read-only keys. Organization provisioning seeds the system fields from `src/modules/leads/lead-system-fields.ts`.

## Stack

- Node.js 22.22.1 or newer and pnpm 12
- NestJS 11 and TypeScript 5
- PostgreSQL and Prisma 7
- Better Auth with the organization plugin
- Jest 30 and ESLint 10

## Repository Map

- `src/modules`: business features such as auth, api keys, leads and the blog
- `src/core`: infrastructure, configuration, database, health, and security
- `src/common`: shared transport concerns with no feature-specific business logic
- `prisma/schema.prisma`: database model
- `prisma/migrations`: committed, append-only migration history
- `test`: HTTP-level tests
- `docs`: contracts published to other repos, and the deployment runbook

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
- Email and password sign-up is disabled. Sign-in still accepts email and password. New accounts use Google. A Google login links to an existing user with the same email (`trustedProviders: ['google']`, `requireLocalEmailVerified: false`).
- A new user has no organization. They found one through `POST /api/v1/workspaces`. That call uses `auth.api.createOrganization` with `userId` and no headers, because `allowUserToCreateOrganization` is false. The creator is owner. `afterCreateOrganization` still seeds lead system fields.
- Admission comes from the member row, not from `activeOrganizationId`. No member means onboarding. `readAdmission` repairs the session cache when it disagrees with that row.
- The workspace slug is chosen once. `beforeUpdateOrganization` rejects a different slug. The Nest save body has no slug field.
- There is no users module. Member reads come from Better Auth's `/api/v1/auth/organization/list-members` and `get-full-organization`.
- Organization-scoped controllers require `@OrgRoles()` or `@MemberHasPermission()`.
- Scope every tenant query by the authenticated session's `activeOrganizationId`.
- Never return or log account password hashes. Never log session tokens.
- `main.ts` owns CORS. Allowed headers are `Content-Type` and `Authorization` only, so a browser cannot send `x-api-key`. Keep it that way.
- Machine callers authenticate with a long-lived API key in the `x-api-key` header. `ApiKeyGuard` owns that check, and those routes carry `@AllowAnonymous()` so the session guard steps aside. Lead reads (`GET /api/v1/leads`, `/leads/:id`, `/leads/fields`) take a session or a key through `@SessionOrApiKey()`, so agents can dedupe before posting.
- The Better Auth API key plugin owns key generation, hashing, storage, verification and last-use tracking. `ApiKeysService` and `ApiKeyGuard` are adapters over it and never query `api_keys` directly.
- The plugin runs one unnamed configuration, `ORGANIZATION_API_KEY_CONFIG_ID` in `src/modules/auth/api-key-config.ts`, with `references: 'organization'`. `ApiKeyGuard` pins verification to it, because it reads a verified key's `referenceId` as an organization id. A second configuration has to revisit that guard.
- The organization plugin carries a custom `apiKey` statement in `src/modules/auth/organization-access.ts`. `owner` and `admin` manage keys, `member` never does. The stock Better Auth roles do not include that statement, so the roles must stay redeclared there.
- Creation returns the raw key once and nothing reads it again. Never return or log a raw key or a key hash.
- Keys are minted over HTTP by an `owner` or `admin` session. There is no key admin UI. Revoking disables the key rather than deleting it, and repeating a revoke leaves the first revocation time alone.
- An API key carries its own organization. Scope machine reads and writes by the key organization, never by a session.
- Leads start as `new`, and only a session moves them, through `PATCH /api/v1/leads/:id/status`. Never open that route to an API key, because agents must not advance a lead. `status` stays a read-only lead field so no values write can move it.
- Archiving is not a status. `Lead.isArchived` is its own column, moved by `PATCH /api/v1/leads/:id/archive`, and it never touches `status`, so a restored lead comes back at the stage it left on. `GET /api/v1/leads` reads the inbox by default and the archive with `archived=true`, never both. That route is session only for the same reason as status.

## Blog Invariants

- A post slug is unique per organization. A write that asks for a taken slug gets the first free `-2`, `-3` and so on. `writeWithFreeSlug` in `src/modules/blog/free-slug.ts` reads the taken slugs and retries when the unique index refuses a race.
- `Post.hasCustomSlug` stays false until a person or an agent sends a slug. While it is false and the post is a draft, every write makes the slug from the title. `slug: null` hands the slug back to the title. A published post keeps its slug until someone sends a new one.
- An API key creates and patches drafts, and reads posts, categories and tags. Publish, unpublish, `PUT /api/v1/blog/posts/:id`, category and tag writes, and `/blog/access` stay session only.
- Any member adds a category or a tag. Only owners and admins rename or delete one. Adding a name that exists in any case returns the existing one.
- Deleting a category or a tag never deletes a post. `posts.category_id` is set to null and `post_tags` rows cascade. Renaming or deleting one sends `post.updated` for every published post it was on.
- The public category and tag lists leave out anything with no published post, so a name made for a draft stays off the site.
- Webhooks are `post.published`, `post.unpublished` and `post.updated`, signed in `X-Blog-Signature`.

## Prisma Rules

- Use camelCase model fields and map existing snake_case database names with `@map` and `@@map`.
- Create a new migration for schema changes. Never rewrite an applied migration.
- The `ApiKey` model mirrors the Better Auth API key plugin's schema and is reached through `schema: { apikey: { modelName: 'apiKey' } }`. Its field names belong to the plugin; only the `@map` column names are this repository's. Do not rename a field without changing the plugin schema with it.
- `P2002` carries no `meta.target` under the pg driver adapter. Name the constraint you expect through `isUniqueConstraintViolation` in `src/core/database/prisma-errors.ts` and let every other error propagate.
- Regenerate Prisma Client after schema changes.
- Use explicit safe selections when a model contains sensitive fields.
- Use `prisma migrate dev` locally and `prisma migrate deploy` in deployments.

## Deployment

- `compose.yaml` is the prod stack. It is copied as is to `~/docker-apps/postbox/prod` on the VPS and has no Postgres. The database is `postbox` on the shared Postgres, reached over the external `shared-network`. Caddy reaches `postbox-prod-api` over the external `proxy` network.
- CI (`.github/workflows/publish-image.yml`) only builds and pushes `ghcr.io/icarus-automation/cms-api` as `latest` and `sha-<12-character-commit>`. A deploy is a manual `docker compose pull` and `docker compose up -d`.
- The `migrate` service runs `prisma migrate deploy` before `api` starts. That is why `prisma` is a runtime dependency. Keep it there. It calls the Prisma CLI with `node` directly, never `pnpm exec`: pnpm 12 reinstalls first, and as user `node` that fails on root-owned `node_modules`.
- The image build runs `prisma generate` with a dummy `DATABASE_URL`, because `prisma.config.ts` fails without one.
- `main.ts` sets `trust proxy` to 1 for the one Caddy hop, so the throttler sees caller IPs. Cloudflare must stay DNS only for the API host, or the hop count is wrong.
- `docs/deployment.md` is the runbook. Keep it true when compose, hosts or env change.

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
