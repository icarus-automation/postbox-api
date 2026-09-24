import { randomBytes } from 'node:crypto';

import type { PrismaService } from '../../core/database/prisma.service';
import type { Auth } from './auth';

const SLUG_MAX_LENGTH = 40;
const FALLBACK_SLUG = 'organization';
// Enough to survive a lost race: availableSlug re-reads the table each time, so
// every attempt after the first already carries a suffix.
const SLUG_ATTEMPTS = 3;
const SLUG_TAKEN_CODE = 'ORGANIZATION_ALREADY_EXISTS';

type ProvisionedUser = {
  id: string;
  name: string;
  email: string;
};

// Type-only, so reaching back into auth.ts costs no runtime cycle.
type AuthApi = Auth['api'];

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

function organizationLabel(user: ProvisionedUser): string {
  return user.name.trim() || user.email.split('@')[0];
}

async function availableSlug(db: PrismaService, base: string): Promise<string> {
  const slug = base || FALLBACK_SLUG;
  const taken = await db.organization.findUnique({
    where: { slug },
    select: { id: true },
  });

  return taken ? `${slug}-${randomBytes(3).toString('hex')}` : slug;
}

function isSlugTaken(error: unknown): boolean {
  const body = (error as { body?: { code?: string } } | null)?.body;

  return body?.code === SLUG_TAKEN_CODE;
}

async function createOrganization(
  api: AuthApi,
  db: PrismaService,
  name: string,
  base: string,
  userId: string,
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const organization = await api.createOrganization({
        body: { name, slug: await availableSlug(db, base), userId },
      });

      return organization.id;
    } catch (error) {
      if (attempt >= SLUG_ATTEMPTS || !isSlugTaken(error)) throw error;
    }
  }
}

// Every user owns exactly one organization, created alongside their account, so
// no client has to run an organization setup step before it can use the API.
// Better Auth creates it, which runs the organization hooks that seed the lead
// system fields and hold every user to a single membership.
export async function provisionPersonalOrganization(
  api: AuthApi,
  db: PrismaService,
  user: ProvisionedUser,
): Promise<string> {
  const label = organizationLabel(user);
  const organizationId = await createOrganization(
    api,
    db,
    `${label}'s organization`,
    toSlug(label),
    user.id,
  );

  // Sign-up commits its session before this hook runs, so the session the new
  // account already holds needs the organization backfilled.
  await db.session.updateMany({
    where: { userId: user.id, activeOrganizationId: null },
    data: { activeOrganizationId: organizationId },
  });

  return organizationId;
}

export async function getUserOrganizationId(
  db: PrismaService,
  userId: string,
): Promise<string | null> {
  const membership = await db.member.findFirst({
    where: { userId },
    select: { organizationId: true },
  });

  return membership?.organizationId ?? null;
}
