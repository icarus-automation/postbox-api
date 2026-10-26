import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import { ApiKeyGuard } from '../../api-keys/guards/api-key.guard';
import type { ApiKeyRequest } from '../../api-keys/types/api-keys.types';
import type { IntegrationKeyService } from '../../integration/integration-key.service';
import { LeadIntakeGuard } from './lead-intake.guard';

function contextFor(headers: Record<string, string>) {
  const request = { headers } as unknown as ApiKeyRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('LeadIntakeGuard', () => {
  const apiKeyGuard = mock<ApiKeyGuard>();
  const integrationKeys = mock<IntegrationKeyService>();
  const guard = new LeadIntakeGuard(apiKeyGuard, integrationKeys);

  beforeEach(() => {
    mockReset(apiKeyGuard);
    mockReset(integrationKeys);
    apiKeyGuard.canActivate.mockResolvedValue(true);
  });

  it('keeps the admin API key path as it was', async () => {
    const { context } = contextFor({ 'x-api-key': 'cms_valid' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(context);
    expect(integrationKeys.authenticate).not.toHaveBeenCalled();
  });

  it('answers a request with no key the way the admin key guard does', async () => {
    const { context } = contextFor({});
    apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException('Missing API key'));

    await expect(guard.canActivate(context)).rejects.toThrow('Missing API key');
    expect(integrationKeys.authenticate).not.toHaveBeenCalled();
  });

  it('admits an integration key and leaves its organization on the request', async () => {
    integrationKeys.authenticate.mockResolvedValue('organization-a');
    const { context, request } = contextFor({ 'x-integration-key': 'pbi_live' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(integrationKeys.authenticate).toHaveBeenCalledWith('pbi_live');
    expect(request.integrationKey).toEqual({ organizationId: 'organization-a' });
    expect(request.apiKey).toBeUndefined();
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('refuses an integration key nobody holds', async () => {
    integrationKeys.authenticate.mockResolvedValue(null);
    const { context, request } = contextFor({ 'x-integration-key': 'pbi_old' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.integrationKey).toBeUndefined();
  });

  it('judges a request that sends both on its admin key alone', async () => {
    apiKeyGuard.canActivate.mockRejectedValue(new UnauthorizedException('Invalid API key'));
    integrationKeys.authenticate.mockResolvedValue('organization-a');
    const { context } = contextFor({ 'x-api-key': 'cms_bad', 'x-integration-key': 'pbi_live' });

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid API key');
    expect(integrationKeys.authenticate).not.toHaveBeenCalled();
  });
});
