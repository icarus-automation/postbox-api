import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeysService } from '../api-keys.service';
import type { ApiKeyRequest } from '../types/api-keys.types';
import { ApiKeyGuard } from './api-key.guard';

function contextFor(headers: Record<string, string>): {
  context: ExecutionContext;
  request: ApiKeyRequest;
} {
  const request = { headers } as unknown as ApiKeyRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('ApiKeyGuard', () => {
  const authenticateApiKey = jest.fn<ApiKeysService['authenticateApiKey']>();

  let guard: ApiKeyGuard;

  beforeEach(async () => {
    authenticateApiKey.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: ApiKeysService, useValue: { authenticateApiKey } },
      ],
    }).compile();

    guard = module.get(ApiKeyGuard);
  });

  it('rejects a request without an API key header', async () => {
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authenticateApiKey).not.toHaveBeenCalled();
  });

  it('rejects an unknown API key', async () => {
    authenticateApiKey.mockResolvedValue(null);
    const { context } = contextFor({ 'x-api-key': 'cms_unknown' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the organization behind a valid API key', async () => {
    authenticateApiKey.mockResolvedValue({
      id: 'key-a',
      organizationId: 'organization-a',
    });
    const { context, request } = contextFor({ 'x-api-key': ' cms_valid ' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticateApiKey).toHaveBeenCalledWith('cms_valid');
    expect(request.apiKey).toEqual({
      id: 'key-a',
      organizationId: 'organization-a',
    });
  });
});
