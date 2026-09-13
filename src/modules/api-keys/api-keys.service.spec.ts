import { createHash } from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../core/database/prisma.service';
import { ApiKeysService } from './api-keys.service';

type StoredApiKey = {
  name: string;
  keyPrefix: string;
  keyHash: string;
  organizationId: string;
  createdById: string;
};

type ScopedApiKeyQuery = {
  where: {
    id: string;
    organizationId: string;
  };
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('ApiKeysService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const update = jest.fn();

  let service: ApiKeysService;

  beforeEach(async () => {
    create.mockReset();
    findMany.mockReset();
    findFirst.mockReset();
    findUnique.mockReset();
    update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: PrismaService,
          useValue: {
            apiKey: { create, findMany, findFirst, findUnique, update },
          },
        },
      ],
    }).compile();

    service = module.get(ApiKeysService);
  });

  it('returns the raw key once and stores only its hash', async () => {
    let stored: StoredApiKey | undefined;

    create.mockImplementation(({ data }: { data: StoredApiKey }) => {
      stored = data;
      return Promise.resolve({
        id: 'key-a',
        name: data.name,
        keyPrefix: data.keyPrefix,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date('2026-09-12T00:00:00.000Z'),
      });
    });

    const created = await service.createApiKey('organization-a', 'user-a', {
      name: 'postman',
    });

    expect(created.key).toMatch(/^cms_[A-Za-z0-9_-]{43}$/);
    expect(stored).toBeDefined();
    expect(stored?.keyHash).toBe(sha256(created.key));
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(stored?.keyPrefix).toBe(created.key.slice(0, 12));
    expect(stored?.organizationId).toBe('organization-a');
    expect(stored?.createdById).toBe('user-a');
  });

  it('authenticates an active key by hash and records its use', async () => {
    const key = 'cms_a-key-handed-to-a-machine';
    findUnique.mockResolvedValue({
      id: 'key-a',
      organizationId: 'organization-a',
      revokedAt: null,
    });
    update.mockResolvedValue({});

    await expect(service.authenticateApiKey(key)).resolves.toEqual({
      id: 'key-a',
      organizationId: 'organization-a',
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: sha256(key) } }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-a' },
        data: { lastUsedAt: expect.any(Date) as Date },
      }),
    );
  });

  it('rejects unknown and revoked keys', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(service.authenticateApiKey('cms_unknown')).resolves.toBeNull();

    findUnique.mockResolvedValueOnce({
      id: 'key-b',
      organizationId: 'organization-a',
      revokedAt: new Date('2026-09-12T00:00:00.000Z'),
    });
    await expect(service.authenticateApiKey('cms_revoked')).resolves.toBeNull();

    expect(update).not.toHaveBeenCalled();
  });

  it('cannot revoke a key belonging to another organization', async () => {
    findFirst.mockImplementation(({ where }: ScopedApiKeyQuery) =>
      Promise.resolve(
        where.organizationId === 'organization-a'
          ? { id: where.id, revokedAt: null }
          : null,
      ),
    );
    update.mockResolvedValue({ id: 'key-a', revokedAt: new Date() });

    await expect(
      service.revokeApiKey('organization-b', 'key-a'),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();

    await expect(
      service.revokeApiKey('organization-a', 'key-a'),
    ).resolves.toEqual(expect.objectContaining({ id: 'key-a' }));
  });
});
