import { createHash } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { ContentAccessService } from './content-access.service';
import { PublicReadKeyGuard } from './guards/public-read-key.guard';

function context(header?: string, orgSlug = 'acme'): ExecutionContext {
  const request: {
    headers: Record<string, string | undefined>;
    params: { orgSlug?: string };
    publicOrganizationId?: string;
  } = {
    headers: header === undefined ? {} : { 'x-public-key': header },
    params: { orgSlug },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('PublicReadKeyGuard', () => {
  const prisma = mockDeep<PrismaService>();
  const access = new ContentAccessService(prisma);
  const guard = new PublicReadKeyGuard(access);
  const rawKey = 'pub_test-key';
  const publicKeyHash = createHash('sha256').update(rawKey).digest('hex');

  beforeEach(() => {
    mockReset(prisma);
    prisma.organization.findUnique.mockResolvedValue({ id: 'organization-a' } as never);
    prisma.contentAccess.findUnique.mockResolvedValue({ publicKeyHash } as never);
  });

  it('rejects a missing public key', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a bad public key', async () => {
    await expect(guard.canActivate(context('pub_wrong'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown organization slug', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context(rawKey, 'missing'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts the matching key', async () => {
    await expect(guard.canActivate(context(rawKey))).resolves.toBe(true);
  });
});
