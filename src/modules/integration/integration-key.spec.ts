import { mockDeep } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import {
  INTEGRATION_KEY_PREFIX,
  newIntegrationKey,
  provisionIntegrationKey,
  readIntegrationKey,
} from './integration-key';

describe('newIntegrationKey', () => {
  it('starts with the prefix and carries 32 random bytes in a url-safe form', () => {
    const key = newIntegrationKey();

    expect(key.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
    expect(key.slice(INTEGRATION_KEY_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIntegrationKey()));

    expect(keys.size).toBe(50);
  });
});

describe('readIntegrationKey', () => {
  it('reads the header and trims it', () => {
    expect(readIntegrationKey({ 'x-integration-key': ' pbi_abc ' })).toBe('pbi_abc');
  });

  it('takes the first of a repeated header', () => {
    expect(readIntegrationKey({ 'x-integration-key': ['pbi_a', 'pbi_b'] })).toBe('pbi_a');
  });

  it('is undefined without the header, and empty when the header is blank', () => {
    expect(readIntegrationKey({})).toBeUndefined();
    expect(readIntegrationKey({ 'x-integration-key': '  ' })).toBe('');
  });

  it('does not read the admin key header', () => {
    expect(readIntegrationKey({ 'x-api-key': 'cms_abc' })).toBeUndefined();
  });
});

describe('provisionIntegrationKey', () => {
  const prisma = mockDeep<PrismaService>();

  it('gives the organization its one key when it is created', async () => {
    prisma.integrationKey.create.mockResolvedValue({} as never);

    await provisionIntegrationKey(prisma, 'organization-a');

    expect(prisma.integrationKey.create).toHaveBeenCalledTimes(1);
    expect(prisma.integrationKey.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-a',
        key: expect.stringMatching(/^pbi_[A-Za-z0-9_-]{43}$/) as unknown,
      },
    });
  });
});
