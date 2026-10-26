import { NotFoundException } from '@nestjs/common';
import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { IntegrationKeyService } from './integration-key.service';

describe('IntegrationKeyService', () => {
  const prisma = mockDeep<PrismaService>();
  const service = new IntegrationKeyService(prisma);

  beforeEach(() => {
    mockReset(prisma);
  });

  describe('getIntegrationKey', () => {
    it('reads the key of the organization', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue({ key: 'pbi_stored' } as never);

      await expect(service.getIntegrationKey('organization-a')).resolves.toEqual({
        key: 'pbi_stored',
      });
      expect(prisma.integrationKey.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'organization-a' },
        select: { key: true },
      });
    });

    it('answers 404 for an organization with no key', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(null);

      await expect(service.getIntegrationKey('organization-a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('rotateIntegrationKey', () => {
    it('replaces the key of the one row, so the old key stops working', async () => {
      prisma.integrationKey.upsert.mockResolvedValue({} as never);

      const rotated = await service.rotateIntegrationKey('organization-a');

      expect(rotated.key).toMatch(/^pbi_[A-Za-z0-9_-]{43}$/);
      expect(prisma.integrationKey.upsert).toHaveBeenCalledWith({
        where: { organizationId: 'organization-a' },
        create: { organizationId: 'organization-a', key: rotated.key },
        update: { key: rotated.key },
      });
    });

    it('hands out a different key every time', async () => {
      prisma.integrationKey.upsert.mockResolvedValue({} as never);

      const first = await service.rotateIntegrationKey('organization-a');
      const second = await service.rotateIntegrationKey('organization-a');

      expect(second.key).not.toBe(first.key);
    });
  });

  describe('authenticate', () => {
    it('answers with the organization that owns the key', async () => {
      prisma.integrationKey.findFirst.mockResolvedValue({
        organizationId: 'organization-a',
      } as never);

      await expect(service.authenticate('pbi_live')).resolves.toBe('organization-a');
      expect(prisma.integrationKey.findFirst).toHaveBeenCalledWith({
        where: { key: 'pbi_live' },
        select: { organizationId: true },
      });
    });

    it('holds the key to the organization named by a slug', async () => {
      prisma.integrationKey.findFirst.mockResolvedValue({
        organizationId: 'organization-a',
      } as never);

      await service.authenticate('pbi_live', 'acme');

      expect(prisma.integrationKey.findFirst).toHaveBeenCalledWith({
        where: { key: 'pbi_live', organization: { slug: 'acme' } },
        select: { organizationId: true },
      });
    });

    it('answers null for a key nobody holds, such as one that was rotated away', async () => {
      prisma.integrationKey.findFirst.mockResolvedValue(null);

      await expect(service.authenticate('pbi_old', 'acme')).resolves.toBeNull();
    });

    it('does not look up a value that cannot be an integration key', async () => {
      await expect(service.authenticate('cms_admin_key')).resolves.toBeNull();
      await expect(service.authenticate('')).resolves.toBeNull();

      expect(prisma.integrationKey.findFirst).not.toHaveBeenCalled();
    });
  });
});
