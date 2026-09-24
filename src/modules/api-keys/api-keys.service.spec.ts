import type { AuthService } from '@thallesp/nestjs-better-auth';
import { mock } from 'jest-mock-extended';

import type { Auth } from '../auth/auth';
import { ApiKeysService } from './api-keys.service';
import type { StoredApiKey } from './types/api-keys.types';

const createdAt = new Date('2026-09-12T00:00:00.000Z');
const revokedAt = new Date('2026-09-14T00:00:00.000Z');

function storedKey(overrides: Partial<StoredApiKey> = {}): StoredApiKey {
  return {
    id: 'key-a',
    name: 'postman',
    start: 'cms_AbCdEfGh',
    enabled: true,
    lastRequest: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('ApiKeysService', () => {
  const createApiKey = jest.fn();
  const listApiKeys = jest.fn();
  const updateApiKey = jest.fn();

  // Three endpoints stand in for the whole Better Auth server API, which is
  // wider than anything this service reaches for.
  const authService = mock<AuthService<Auth>>({
    api: { createApiKey, listApiKeys, updateApiKey } as unknown as Auth['api'],
  });

  const service = new ApiKeysService(authService);
  const headers = new Headers();

  beforeEach(() => {
    createApiKey.mockReset();
    listApiKeys.mockReset();
    updateApiKey.mockReset();
  });

  it('asks Better Auth to mint the key for the calling organization', async () => {
    createApiKey.mockResolvedValue({ ...storedKey(), key: 'cms_AbCdEfGh1234' });

    const created = await service.createApiKey('organization-a', 'user-a', {
      name: 'postman',
    });

    expect(createApiKey).toHaveBeenCalledWith({
      body: {
        name: 'postman',
        organizationId: 'organization-a',
        userId: 'user-a',
        metadata: { createdById: 'user-a' },
      },
    });
    expect(created).toEqual({
      id: 'key-a',
      name: 'postman',
      keyPrefix: 'cms_AbCdEfGh',
      lastUsedAt: null,
      revokedAt: null,
      createdAt,
      key: 'cms_AbCdEfGh1234',
    });
  });

  it('returns the raw key once and never a stored digest', async () => {
    createApiKey.mockResolvedValue({ ...storedKey(), key: 'cms_raw' });
    listApiKeys.mockResolvedValue({ apiKeys: [storedKey()] });

    const created = await service.createApiKey('organization-a', 'user-a', {
      name: 'postman',
    });
    const [listed] = await service.getAllApiKeys('organization-a', headers);

    expect(created.key).toBe('cms_raw');
    expect(Object.keys(listed)).not.toContain('key');
    expect(JSON.stringify(listed)).not.toContain('cms_raw');
  });

  it('lists only the keys of the calling organization, newest first', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [] });

    await service.getAllApiKeys('organization-a', headers);

    expect(listApiKeys).toHaveBeenCalledWith({
      headers,
      query: {
        organizationId: 'organization-a',
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
    });
  });

  it('reports a disabled key as revoked when it was last changed', async () => {
    listApiKeys.mockResolvedValue({
      apiKeys: [storedKey({ enabled: false, updatedAt: revokedAt })],
    });

    await expect(
      service.getAllApiKeys('organization-a', headers),
    ).resolves.toEqual([expect.objectContaining({ revokedAt })]);
  });

  it('revokes by disabling the key rather than deleting it', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [storedKey()] });
    updateApiKey.mockResolvedValue(
      storedKey({ enabled: false, updatedAt: revokedAt }),
    );

    await expect(
      service.revokeApiKey('organization-a', 'key-a', 'user-a', headers),
    ).resolves.toEqual(expect.objectContaining({ id: 'key-a', revokedAt }));
    expect(updateApiKey).toHaveBeenCalledWith({
      body: { keyId: 'key-a', enabled: false, userId: 'user-a' },
    });
  });

  it('leaves the first revocation time alone on a second revoke', async () => {
    listApiKeys.mockResolvedValue({
      apiKeys: [storedKey({ enabled: false, updatedAt: revokedAt })],
    });

    await expect(
      service.revokeApiKey('organization-a', 'key-a', 'user-a', headers),
    ).resolves.toEqual(expect.objectContaining({ revokedAt }));
    expect(updateApiKey).not.toHaveBeenCalled();
  });

  it('cannot revoke a key belonging to another organization', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [] });

    await expect(
      service.revokeApiKey('organization-b', 'key-a', 'user-a', headers),
    ).resolves.toBeNull();
    expect(updateApiKey).not.toHaveBeenCalled();
  });
});
