import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import type { Auth } from './auth';
import {
  getUserOrganizationId,
  provisionPersonalOrganization,
} from './organization-provisioning';

type AuthApi = Auth['api'];
type CreatedOrganization = { name: string; slug: string; userId?: string };
type CreateOrganizationCall = { body: CreatedOrganization };

type FoundOrganization = Awaited<
  ReturnType<PrismaService['organization']['findUnique']>
>;
type FoundMember = Awaited<ReturnType<PrismaService['member']['findFirst']>>;

function slugTakenError(): Error {
  return Object.assign(new Error('Organization already exists'), {
    body: { code: 'ORGANIZATION_ALREADY_EXISTS' },
  });
}

describe('organization provisioning', () => {
  const prisma = mockDeep<PrismaService>();
  const createOrganization = jest.fn();
  const api = { createOrganization } as unknown as AuthApi;

  let created: CreatedOrganization[];

  beforeEach(() => {
    mockReset(prisma);
    createOrganization.mockReset();
    created = [];

    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    createOrganization.mockImplementation((input: CreateOrganizationCall) => {
      created.push(input.body);
      return Promise.resolve({ id: 'organization-a' });
    });
  });

  it('hands Better Auth the organization to create for the new user', async () => {
    const organizationId = await provisionPersonalOrganization(api, prisma, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(organizationId).toBe('organization-a');
    expect(created).toEqual([
      { name: "Ace Owner's organization", slug: 'ace-owner', userId: 'user-a' },
    ]);
  });

  it('never creates the organization, its owner or its fields itself', async () => {
    await provisionPersonalOrganization(api, prisma, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.member.create).not.toHaveBeenCalled();
    // Lead system fields are seeded by the organization hook, not from here.
    expect(prisma.fieldDefinition.createMany).not.toHaveBeenCalled();
  });

  it('backfills a session that was created before the organization existed', async () => {
    await provisionPersonalOrganization(api, prisma, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', activeOrganizationId: null },
      data: { activeOrganizationId: 'organization-a' },
    });
  });

  it('falls back to the email local part when the name is blank', async () => {
    await provisionPersonalOrganization(api, prisma, {
      id: 'user-b',
      name: '   ',
      email: 'dana.reyes@example.com',
    });

    expect(created[0]).toEqual(
      expect.objectContaining({
        name: "dana.reyes's organization",
        slug: 'dana-reyes',
      }),
    );
  });

  it('suffixes the slug when it is already taken', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'organization-z',
    } as FoundOrganization);

    await provisionPersonalOrganization(api, prisma, {
      id: 'user-c',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(created[0].slug).toMatch(/^ace-owner-[0-9a-f]{6}$/);
  });

  it('retries with a fresh slug when it loses the race for one', async () => {
    createOrganization.mockImplementationOnce(() => {
      throw slugTakenError();
    });
    prisma.organization.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'organization-z' } as FoundOrganization);

    await expect(
      provisionPersonalOrganization(api, prisma, {
        id: 'user-d',
        name: 'Ace Owner',
        email: 'ace@example.com',
      }),
    ).resolves.toBe('organization-a');

    expect(createOrganization).toHaveBeenCalledTimes(2);
    expect(created).toEqual([
      expect.objectContaining({
        slug: expect.stringMatching(/^ace-owner-/) as unknown,
      }),
    ]);
  });

  it('gives up on an error that is not a taken slug', async () => {
    createOrganization.mockImplementation(() => {
      throw new Error('database is down');
    });

    await expect(
      provisionPersonalOrganization(api, prisma, {
        id: 'user-e',
        name: 'Ace Owner',
        email: 'ace@example.com',
      }),
    ).rejects.toThrow('database is down');
    expect(createOrganization).toHaveBeenCalledTimes(1);
  });

  it('reads the organization a session should activate', async () => {
    prisma.member.findFirst.mockResolvedValueOnce({
      organizationId: 'organization-a',
    } as FoundMember);
    await expect(getUserOrganizationId(prisma, 'user-a')).resolves.toBe(
      'organization-a',
    );

    prisma.member.findFirst.mockResolvedValueOnce(null);
    await expect(getUserOrganizationId(prisma, 'user-z')).resolves.toBeNull();
  });
});
