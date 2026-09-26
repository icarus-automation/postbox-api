import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';

import type { PrismaService } from '../../core/database/prisma.service';
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  type ImageContentType,
} from '../blog/document/blog.types';
import type { ObjectStorage } from '../blog/object-storage';
import type { Auth } from './auth';

const SLUG_MAX_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

declare const sealed: unique symbol;

/** Lowercase slug written once at create. Not a field of any update input. */
export type SealedSlug = string & { readonly [sealed]: 'sealed' };

export type PasswordSlot = 'open' | 'sealed';

export type MemberRole = 'owner' | 'admin' | 'member';

export type EditorRole = 'owner' | 'admin';

export type AdmissionUser = {
  id: string;
  name: string;
  email: string;
};

export type SealedWorkspace = {
  id: string;
  name: string;
  slug: SealedSlug;
  website: string | null;
  logoUrl: string | null;
  role: MemberRole;
};

export type Admission =
  | { phase: 'signed-out' }
  | {
      phase: 'onboarding';
      user: AdmissionUser;
      password: PasswordSlot;
      workspaceUrlPrefix: string;
    }
  | {
      phase: 'admitted';
      user: AdmissionUser;
      password: PasswordSlot;
      workspaceUrlPrefix: string;
      workspace: SealedWorkspace;
    };

export type LogoChange =
  | { kind: 'unchanged' }
  | { kind: 'clear' }
  | { kind: 'hold'; storageKey: string };

/** What the browser sends. No slug. */
export type ProfilePatch = {
  name: string;
  website: string | null;
  logo: LogoChange;
};

export type FoundWorkspaceInput = {
  name: string;
  slug: string;
  website: string | null;
  logoHoldKey: string | null;
};

export type SlugPreview =
  | { outcome: 'available'; slug: string }
  | { outcome: 'taken'; slug: string }
  | { outcome: 'invalid' };

export type MemberSnapshot = {
  organizationId: string;
  role: MemberRole;
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
};

type WorkspaceApi = Pick<Auth['api'], 'createOrganization' | 'updateOrganization'>;

export function editorRole(role: MemberRole): EditorRole | null {
  return role === 'owner' || role === 'admin' ? role : null;
}

export function parseClaimableSlug(
  raw: string,
): { ok: true; slug: string } | { ok: false } {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

  if (!SLUG_PATTERN.test(slug)) return { ok: false };
  return { ok: true, slug };
}

/**
 * The plugin stores a slug returned from this hook, so a rewrite would persist
 * a string the preview did not show. Reject anything that is not already canonical.
 */
export function assertCanonicalSlug(slug: string | undefined): void {
  const parsed = parseClaimableSlug(slug ?? '');
  if (!parsed.ok || slug !== parsed.slug) {
    throw new APIError('BAD_REQUEST', {
      message: 'Slug is invalid',
      code: 'ORGANIZATION_SLUG_INVALID',
    });
  }
}

export function classifyAdmission(input: {
  user: AdmissionUser | null;
  password: PasswordSlot;
  workspaceUrlPrefix: string;
  member: MemberSnapshot | null;
}): Admission {
  if (!input.user) return { phase: 'signed-out' };

  if (!input.member) {
    return {
      phase: 'onboarding',
      user: input.user,
      password: input.password,
      workspaceUrlPrefix: input.workspaceUrlPrefix,
    };
  }

  return {
    phase: 'admitted',
    user: input.user,
    password: input.password,
    workspaceUrlPrefix: input.workspaceUrlPrefix,
    workspace: seal(input.member),
  };
}

export function seal(member: MemberSnapshot): SealedWorkspace {
  return {
    id: member.organizationId,
    name: member.name,
    slug: member.slug as SealedSlug,
    website: member.website,
    logoUrl: member.logoUrl,
    role: member.role,
  };
}

/**
 * The plugin merges returned data into the patch, so dropping the slug key here
 * would not remove it. The same slug is a no-op. A different one is rejected.
 */
export async function rejectDifferentSlug(
  db: PrismaService,
  organizationId: string,
  slug: unknown,
): Promise<void> {
  if (typeof slug !== 'string') return;

  const current = await db.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });

  if (current?.slug === slug) return;

  throw new APIError('BAD_REQUEST', {
    message: 'Slug cannot change',
    code: 'SLUG_IMMUTABLE',
  });
}

export async function findMembership(
  db: PrismaService,
  userId: string,
): Promise<MemberSnapshot | null> {
  const member = await db.member.findUnique({
    where: { userId },
    select: {
      role: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          slug: true,
          website: true,
          logo: true,
        },
      },
    },
  });

  if (!member) return null;

  return {
    organizationId: member.organizationId,
    role: asMemberRole(member.role),
    name: member.organization.name,
    slug: member.organization.slug,
    website: member.organization.website,
    logoUrl: member.organization.logo,
  };
}

export async function passwordSlotFor(
  db: PrismaService,
  userId: string,
): Promise<PasswordSlot> {
  const account = await db.account.findFirst({
    where: { userId, providerId: 'credential' },
    select: { password: true },
  });

  return account?.password ? 'sealed' : 'open';
}

export async function activateMembership(
  db: PrismaService,
  userId: string,
  organizationId: string,
): Promise<void> {
  // SQL inequality does not match NULL, and a new session can still hold a null id.
  await db.session.updateMany({
    where: {
      userId,
      OR: [
        { activeOrganizationId: null },
        { activeOrganizationId: { not: organizationId } },
      ],
    },
    data: { activeOrganizationId: organizationId },
  });
}

export async function readAdmission(
  db: PrismaService,
  deps: {
    user: AdmissionUser | null;
    workspaceUrlPrefix: string;
    activeOrganizationId: string | null;
  },
): Promise<Admission> {
  if (!deps.user) return { phase: 'signed-out' };

  const member = await findMembership(db, deps.user.id);
  const password = await passwordSlotFor(db, deps.user.id);
  const admission = classifyAdmission({
    user: deps.user,
    password,
    workspaceUrlPrefix: deps.workspaceUrlPrefix,
    member,
  });

  if (
    admission.phase === 'admitted' &&
    deps.activeOrganizationId !== admission.workspace.id
  ) {
    await activateMembership(db, deps.user.id, admission.workspace.id);
  }

  return admission;
}

export async function previewSlug(
  db: PrismaService,
  raw: string,
): Promise<SlugPreview> {
  const parsed = parseClaimableSlug(raw);
  if (!parsed.ok || parsed.slug !== raw) return { outcome: 'invalid' };

  const row = await db.organization.findUnique({
    where: { slug: parsed.slug },
    select: { id: true },
  });

  return row
    ? { outcome: 'taken', slug: parsed.slug }
    : { outcome: 'available', slug: parsed.slug };
}

export async function presignLogoHold(
  storage: ObjectStorage,
  userId: string,
  input: { contentType: ImageContentType; byteSize: number },
): Promise<{ uploadUrl: string; storageKey: string; headers: Record<string, string> }> {
  if (
    !(IMAGE_CONTENT_TYPES as readonly string[]).includes(input.contentType) ||
    !Number.isInteger(input.byteSize) ||
    input.byteSize < 1 ||
    input.byteSize > MAX_IMAGE_BYTES
  ) {
    throw new BadRequestException('Logo upload is invalid');
  }

  const storageKey = `holds/${userId}/${randomUUID()}`;
  const signed = await storage.presignPut({
    storageKey,
    contentType: input.contentType,
    byteSize: input.byteSize,
  });

  return { storageKey, ...signed };
}

export async function logoUrlFromHold(
  storage: ObjectStorage,
  userId: string,
  storageKey: string,
): Promise<string> {
  const prefix = `holds/${userId}/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..')) {
    throw new BadRequestException('Logo upload is invalid');
  }

  const object = await storage.head(storageKey);
  if (
    !object ||
    !(IMAGE_CONTENT_TYPES as readonly string[]).includes(object.contentType) ||
    object.byteSize < 1 ||
    object.byteSize > MAX_IMAGE_BYTES
  ) {
    throw new BadRequestException('Logo upload was not found');
  }

  return storage.publicUrl(storageKey);
}

/**
 * Headers would make this a user action, and allowUserToCreateOrganization false
 * would reject it. userId keeps the call a system action that still assigns owner.
 */
export async function foundWorkspace(
  api: WorkspaceApi,
  db: PrismaService,
  storage: ObjectStorage,
  userId: string,
  input: FoundWorkspaceInput,
): Promise<SealedWorkspace> {
  const existing = await findMembership(db, userId);
  if (existing) {
    await activateMembership(db, userId, existing.organizationId);
    return seal(existing);
  }

  const parsed = parseClaimableSlug(input.slug);
  if (!parsed.ok || parsed.slug !== input.slug) {
    throw new BadRequestException('Workspace URL is invalid');
  }

  const taken = await db.organization.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (taken) throw new ConflictException('That workspace URL is taken');

  const name = organizationName(input.name);
  const website = websiteOrNull(input.website);
  const logo = input.logoHoldKey
    ? await logoUrlFromHold(storage, userId, input.logoHoldKey)
    : null;

  try {
    await api.createOrganization({
      body: {
        name,
        slug: input.slug,
        logo,
        // Optional additional fields are nullish at runtime. The call type only lists string.
        website: website as string | undefined,
        userId,
      },
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS') {
      const raced = await findMembership(db, userId);
      if (raced) {
        await activateMembership(db, userId, raced.organizationId);
        return seal(raced);
      }
    }
    if (code === 'ORGANIZATION_ALREADY_EXISTS' || code === 'ORGANIZATION_SLUG_ALREADY_TAKEN') {
      throw new ConflictException('That workspace URL is taken');
    }
    throw error;
  }

  const created = await findMembership(db, userId);
  if (!created) {
    throw new InternalServerErrorException('Workspace was not created');
  }
  await activateMembership(db, userId, created.organizationId);
  return seal(created);
}

export async function saveProfile(
  api: WorkspaceApi,
  db: PrismaService,
  storage: ObjectStorage,
  userId: string,
  headers: Headers,
  patch: ProfilePatch,
): Promise<SealedWorkspace> {
  const name = organizationName(patch.name);
  const website = websiteOrNull(patch.website);
  const data: { name: string; website: string | null; logo?: string | null } = {
    name,
    website,
  };

  if (patch.logo.kind === 'clear') data.logo = null;
  if (patch.logo.kind === 'hold') {
    data.logo = await logoUrlFromHold(storage, userId, patch.logo.storageKey);
  }

  await api.updateOrganization({
    headers,
    body: {
      data: {
        name,
        website: website as string | undefined,
        ...(data.logo === undefined ? {} : { logo: data.logo }),
      },
    },
  });

  const updated = await findMembership(db, userId);
  if (!updated) throw new InternalServerErrorException('Workspace was not found');
  return seal(updated);
}

function organizationName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > 100) {
    throw new BadRequestException('Organization name is invalid');
  }
  return name;
}

function websiteOrNull(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('Company website must be an http(s) URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Company website must be an http(s) URL');
  }

  return trimmed;
}

function asMemberRole(role: string): MemberRole {
  if (role === 'owner' || role === 'admin' || role === 'member') return role;
  return 'member';
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const body = (error as { body?: { code?: string } }).body;
  return body?.code;
}
