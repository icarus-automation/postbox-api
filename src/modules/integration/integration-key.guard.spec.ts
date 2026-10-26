import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import { IntegrationKeyGuard } from './integration-key.guard';
import type { IntegrationKeyService } from './integration-key.service';
import type { IntegrationKeyRequest } from './types/integration-key.types';

function contextFor(headers: Record<string, string>, orgSlug = 'acme') {
  const request = { headers, params: { orgSlug } } as unknown as IntegrationKeyRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('IntegrationKeyGuard', () => {
  const keys = mock<IntegrationKeyService>();
  const guard = new IntegrationKeyGuard(keys);

  beforeEach(() => {
    mockReset(keys);
    keys.authenticate.mockResolvedValue('organization-a');
  });

  it('rejects a request without the key and does not look anything up', async () => {
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it('rejects a blank key', async () => {
    const { context } = contextFor({ 'x-integration-key': '   ' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it('rejects a key the organization in the path does not hold', async () => {
    keys.authenticate.mockResolvedValue(null);
    const { context, request } = contextFor({ 'x-integration-key': 'pbi_wrong' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keys.authenticate).toHaveBeenCalledWith('pbi_wrong', 'acme');
    expect(request.integrationKey).toBeUndefined();
  });

  it('does not take the old public key header any more', async () => {
    const { context } = contextFor({ 'x-public-key': 'pub_old' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it('does not take an admin API key', async () => {
    const { context } = contextFor({ 'x-api-key': 'cms_admin' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keys.authenticate).not.toHaveBeenCalled();
  });

  it('lets the matching key through and leaves its organization on the request', async () => {
    const { context, request } = contextFor({ 'x-integration-key': ' pbi_live ' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(keys.authenticate).toHaveBeenCalledWith('pbi_live', 'acme');
    expect(request.integrationKey).toEqual({ organizationId: 'organization-a' });
  });
});
