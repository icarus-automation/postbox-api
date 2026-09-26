import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import type { ObjectStorage } from '../blog/object-storage';
import type { Auth } from './auth';
import { SaveProfileDto } from './workspace.dto';
import {
  assertCanonicalSlug,
  classifyAdmission,
  foundWorkspace,
  parseClaimableSlug,
  presignLogoHold,
  previewSlug,
  readAdmission,
  rejectDifferentSlug,
  saveProfile,
} from './workspace';

type CreateBody = {
  body: {
    name: string;
    slug: string;
    logo: string | null;
    website: string | null;
    userId: string;
  };
};

type UpdateBody = {
  headers: Headers;
  body: { data: Record<string, unknown> };
};

type AuthApi = Auth['api'];

const USER = { id: 'user-a', name: 'Ace', email: 'ace@example.com' };
const PREFIX = 'handshakes.cards/';

function errorCode(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return codeOf(error);
  }
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null) return undefined;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function memberRow() {
  return {
    role: 'owner',
    organizationId: 'organization-a',
    organization: {
      name: 'Acme Inc',
      slug: 'acme-inc',
      website: null,
      logo: null,
    },
  };
}

describe('workspace admission', () => {
  const prisma = mockDeep<PrismaService>();
  const createOrganization = jest.fn<Promise<{ id: string }>, [CreateBody]>();
  const updateOrganization = jest.fn<Promise<{ id: string }>, [UpdateBody]>();
  const api = { createOrganization, updateOrganization } as unknown as AuthApi;
  const storage: ObjectStorage = {
    presignPut: jest.fn(),
    head: jest.fn(),
    publicUrl: jest.fn((key: string) => `https://cdn.example/${key}`),
  };

  beforeEach(() => {
    mockReset(prisma);
    createOrganization.mockReset();
    updateOrganization.mockReset();
    jest.mocked(storage.presignPut).mockReset();
    jest.mocked(storage.head).mockReset();
    createOrganization.mockResolvedValue({ id: 'organization-a' });
    updateOrganization.mockResolvedValue({ id: 'organization-a' });
  });

  it('classifies a signed-in user with no member row as onboarding', () => {
    expect(
      classifyAdmission({
        user: USER,
        password: 'open',
        workspaceUrlPrefix: PREFIX,
        member: null,
      }),
    ).toEqual({
      phase: 'onboarding',
      user: USER,
      password: 'open',
      workspaceUrlPrefix: PREFIX,
    });
  });

  it('parses Acme Inc into the slug the public lookup will store', () => {
    expect(parseClaimableSlug('Acme Inc')).toEqual({ ok: true, slug: 'acme-inc' });
    expect(parseClaimableSlug('acme-inc')).toEqual({ ok: true, slug: 'acme-inc' });
    expect(parseClaimableSlug('!!!')).toEqual({ ok: false });
    expect(() => assertCanonicalSlug('acme-inc')).not.toThrow();
    expect(errorCode(() => assertCanonicalSlug('Acme Inc'))).toBe('ORGANIZATION_SLUG_INVALID');
  });

  it('creates the workspace through the plugin as owner and activates the session', async () => {
    prisma.member.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(memberRow() as never);
    prisma.organization.findUnique.mockResolvedValue(null);

    const workspace = await foundWorkspace(api, prisma, storage, 'user-a', {
      name: '  Acme Inc  ',
      slug: 'acme-inc',
      website: '',
      logoHoldKey: null,
    });

    expect(workspace).toEqual({
      id: 'organization-a',
      name: 'Acme Inc',
      slug: 'acme-inc',
      website: null,
      logoUrl: null,
      role: 'owner',
    });
    expect(createOrganization).toHaveBeenCalledWith({
      body: {
        name: 'Acme Inc',
        slug: 'acme-inc',
        logo: null,
        website: null,
        userId: 'user-a',
      },
    });
    expect(createOrganization.mock.calls[0]?.[0]).not.toHaveProperty('headers');
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.member.create).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        OR: [
          { activeOrganizationId: null },
          { activeOrganizationId: { not: 'organization-a' } },
        ],
      },
      data: { activeOrganizationId: 'organization-a' },
    });
  });

  it('returns the existing workspace on a second create and does not call create again', async () => {
    prisma.member.findUnique.mockResolvedValue(memberRow() as never);

    const first = await foundWorkspace(api, prisma, storage, 'user-a', {
      name: 'Other Name',
      slug: 'other-name',
      website: null,
      logoHoldKey: null,
    });
    const second = await foundWorkspace(api, prisma, storage, 'user-a', {
      name: 'Other Name',
      slug: 'other-name',
      website: null,
      logoHoldKey: null,
    });

    expect(first).toEqual(second);
    expect(first.slug).toBe('acme-inc');
    expect(first.name).toBe('Acme Inc');
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug and a taken slug without inventing a suffix', async () => {
    prisma.member.findUnique.mockResolvedValue(null);

    await expect(
      foundWorkspace(api, prisma, storage, 'user-a', {
        name: 'Acme Inc',
        slug: 'Acme Inc',
        website: null,
        logoHoldKey: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.organization.findUnique.mockResolvedValue({ id: 'organization-z' } as never);
    await expect(
      foundWorkspace(api, prisma, storage, 'user-a', {
        name: 'Acme Inc',
        slug: 'acme-inc',
        website: null,
        logoHoldKey: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(createOrganization).not.toHaveBeenCalled();
    await expect(previewSlug(prisma, 'acme-inc')).resolves.toEqual({
      outcome: 'taken',
      slug: 'acme-inc',
    });
  });

  it('rejects a different slug and leaves the same slug alone', async () => {
    prisma.organization.findUnique.mockResolvedValue({ slug: 'acme-inc' } as never);

    await expect(
      rejectDifferentSlug(prisma, 'organization-a', 'other-inc'),
    ).rejects.toMatchObject({ body: { code: 'SLUG_IMMUTABLE' } });

    await expect(
      rejectDifferentSlug(prisma, 'organization-a', 'acme-inc'),
    ).resolves.toBeUndefined();
    await expect(
      rejectDifferentSlug(prisma, 'organization-a', undefined),
    ).resolves.toBeUndefined();
  });

  it('repairs activeOrganizationId from the member row when the cache disagrees', async () => {
    prisma.member.findUnique.mockResolvedValue(memberRow() as never);
    prisma.account.findFirst.mockResolvedValue({ password: 'scrypt-hash' } as never);

    const admission = await readAdmission(prisma, {
      user: USER,
      workspaceUrlPrefix: PREFIX,
      activeOrganizationId: 'stale-organization',
    });

    expect(admission).toMatchObject({
      phase: 'admitted',
      password: 'sealed',
      workspaceUrlPrefix: PREFIX,
      workspace: { id: 'organization-a', slug: 'acme-inc' },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-a',
        OR: [
          { activeOrganizationId: null },
          { activeOrganizationId: { not: 'organization-a' } },
        ],
      },
      data: { activeOrganizationId: 'organization-a' },
    });
  });

  it('stores a held logo url and refuses a slug on the save body', async () => {
    jest.mocked(storage.head).mockResolvedValue({
      contentType: 'image/png',
      byteSize: 1200,
    });
    prisma.member.findUnique.mockResolvedValue({
      ...memberRow(),
      organization: {
        ...memberRow().organization,
        website: 'https://acme-inc.com',
        logo: 'https://cdn.example/holds/user-a/file',
      },
    } as never);

    const saved = await saveProfile(api, prisma, storage, 'user-a', new Headers(), {
      name: 'Acme Inc',
      website: 'https://acme-inc.com',
      logo: { kind: 'hold', storageKey: 'holds/user-a/file' },
    });

    const savedCall = updateOrganization.mock.calls[0]?.[0];
    expect(savedCall?.headers).toBeInstanceOf(Headers);
    expect(savedCall?.body.data).toEqual({
      name: 'Acme Inc',
      website: 'https://acme-inc.com',
      logo: 'https://cdn.example/holds/user-a/file',
    });
    expect(savedCall?.body.data).not.toHaveProperty('slug');
    expect(saved.logoUrl).toBe('https://cdn.example/holds/user-a/file');

    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        {
          name: 'Acme Inc',
          website: null,
          logo: { kind: 'unchanged' },
          slug: 'renamed',
        },
        { type: 'body', metatype: SaveProfileDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('presigns a logo hold under the user and rejects a file over 5000000 bytes', async () => {
    jest.mocked(storage.presignPut).mockResolvedValue({
      uploadUrl: 'https://upload.example/put',
      headers: { 'content-type': 'image/webp' },
    });

    const held = await presignLogoHold(storage, 'user-a', {
      contentType: 'image/webp',
      byteSize: 5_000_000,
    });

    expect(held.uploadUrl).toBe('https://upload.example/put');
    expect(held.storageKey).toMatch(
      /^holds\/user-a\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(storage.presignPut).toHaveBeenCalledWith({
      storageKey: held.storageKey,
      contentType: 'image/webp',
      byteSize: 5_000_000,
    });

    await expect(
      presignLogoHold(storage, 'user-a', {
        contentType: 'image/png',
        byteSize: 5_000_001,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
