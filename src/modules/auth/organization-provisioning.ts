import { randomBytes, randomUUID } from 'node:crypto';

import type { PrismaService } from '../../core/database/prisma.service';
import { provisionLeadSystemFields } from '../leads/lead-system-fields';

const SLUG_MAX_LENGTH = 40;
const FALLBACK_SLUG = 'organization';

type ProvisionedUser = {
  id: string;
  name: string;
  email: string;
};

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

// Every user owns exactly one organization, created alongside their account, so
// no client has to run an organization setup step before it can use the API.
export async function provisionPersonalOrganization(
  db: PrismaService,
  user: ProvisionedUser,
): Promise<string> {
  const label = organizationLabel(user);
  const createdAt = new Date();

  const organization = await db.organization.create({
    data: {
      id: randomUUID(),
      name: `${label}'s organization`,
      slug: await availableSlug(db, toSlug(label)),
      createdAt,
    },
    select: { id: true },
  });

  await db.member.create({
    data: {
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      createdAt,
    },
  });

  await provisionLeadSystemFields(db, organization.id);

  // Sign-up commits its session before this hook runs, so the session the new
  // account already holds needs the organization backfilled.
  await db.session.updateMany({
    where: { userId: user.id, activeOrganizationId: null },
    data: { activeOrganizationId: organization.id },
  });

  return organization.id;
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
