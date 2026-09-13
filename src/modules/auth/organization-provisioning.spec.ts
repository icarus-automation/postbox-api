import type { PrismaService } from '../../core/database/prisma.service';
import {
  getUserOrganizationId,
  provisionPersonalOrganization,
} from './organization-provisioning';

type CreatedOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

type CreatedMember = {
  organizationId: string;
  userId: string;
  role: string;
};

describe('organization provisioning', () => {
  const organizationCreate = jest.fn();
  const organizationFindUnique = jest.fn();
  const memberCreate = jest.fn();
  const memberFindFirst = jest.fn();
  const sessionUpdateMany = jest.fn();
  const fieldDefinitionCreateMany = jest.fn();

  const db = {
    organization: {
      create: organizationCreate,
      findUnique: organizationFindUnique,
    },
    member: { create: memberCreate, findFirst: memberFindFirst },
    session: { updateMany: sessionUpdateMany },
    fieldDefinition: { createMany: fieldDefinitionCreateMany },
  } as unknown as PrismaService;

  let organization: CreatedOrganization | undefined;
  let member: CreatedMember | undefined;

  beforeEach(() => {
    organizationCreate.mockReset();
    organizationFindUnique.mockReset();
    memberCreate.mockReset();
    memberFindFirst.mockReset();
    sessionUpdateMany.mockReset();
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    fieldDefinitionCreateMany.mockReset();
    fieldDefinitionCreateMany.mockResolvedValue({ count: 8 });
    organization = undefined;
    member = undefined;

    organizationFindUnique.mockResolvedValue(null);
    organizationCreate.mockImplementation(
      ({ data }: { data: CreatedOrganization }) => {
        organization = data;
        return Promise.resolve({ id: data.id });
      },
    );
    memberCreate.mockImplementation(({ data }: { data: CreatedMember }) => {
      member = data;
      return Promise.resolve({});
    });
  });

  it('names the organization after the user and makes them its owner', async () => {
    const organizationId = await provisionPersonalOrganization(db, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(organization?.name).toBe("Ace Owner's organization");
    expect(organization?.slug).toBe('ace-owner');
    expect(member).toEqual(
      expect.objectContaining({
        organizationId,
        userId: 'user-a',
        role: 'owner',
      }),
    );
  });

  it('gives the new organization its lead system fields', async () => {
    const organizationId = await provisionPersonalOrganization(db, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(fieldDefinitionCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ organizationId, key: 'status' }),
      ]) as unknown[],
    });
  });

  it('backfills a session that was created before the organization existed', async () => {
    const organizationId = await provisionPersonalOrganization(db, {
      id: 'user-a',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', activeOrganizationId: null },
      data: { activeOrganizationId: organizationId },
    });
  });

  it('falls back to the email local part when the name is blank', async () => {
    await provisionPersonalOrganization(db, {
      id: 'user-b',
      name: '   ',
      email: 'dana.reyes@example.com',
    });

    expect(organization?.name).toBe("dana.reyes's organization");
    expect(organization?.slug).toBe('dana-reyes');
  });

  it('suffixes the slug when it is already taken', async () => {
    organizationFindUnique.mockResolvedValue({ id: 'organization-a' });

    await provisionPersonalOrganization(db, {
      id: 'user-c',
      name: 'Ace Owner',
      email: 'ace@example.com',
    });

    expect(organization?.slug).toMatch(/^ace-owner-[0-9a-f]{6}$/);
  });

  it('reads the organization a session should activate', async () => {
    memberFindFirst.mockResolvedValue({ organizationId: 'organization-a' });
    await expect(getUserOrganizationId(db, 'user-a')).resolves.toBe(
      'organization-a',
    );

    memberFindFirst.mockResolvedValue(null);
    await expect(getUserOrganizationId(db, 'user-z')).resolves.toBeNull();
  });
});
