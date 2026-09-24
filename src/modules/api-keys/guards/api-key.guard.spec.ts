import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import { mock } from 'jest-mock-extended';

import { ORGANIZATION_API_KEY_CONFIG_ID } from '../../auth/api-key-config';
import type { Auth } from '../../auth/auth';
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
  const verifyApiKey = jest.fn();
  const authService = mock<AuthService<Auth>>({
    api: { verifyApiKey } as unknown as Auth['api'],
  });

  const guard = new ApiKeyGuard(authService);

  beforeEach(() => {
    verifyApiKey.mockReset();
  });

  it('rejects a request without an API key header', async () => {
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('rejects a key Better Auth does not accept', async () => {
    verifyApiKey.mockResolvedValue({
      valid: false,
      error: { code: 'KEY_DISABLED' },
      key: null,
    });
    const { context } = contextFor({ 'x-api-key': 'cms_revoked' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the organization behind a valid API key', async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { id: 'key-a', referenceId: 'organization-a' },
    });
    const { context, request } = contextFor({ 'x-api-key': ' cms_valid ' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyApiKey).toHaveBeenCalledWith({
      body: { key: 'cms_valid', configId: ORGANIZATION_API_KEY_CONFIG_ID },
    });
    expect(request.apiKey).toEqual({
      id: 'key-a',
      organizationId: 'organization-a',
    });
  });

  it('refuses a key from another configuration, which would not be an organization', async () => {
    verifyApiKey.mockResolvedValue({ valid: true, error: null, key: null });
    const { context, request } = contextFor({ 'x-api-key': 'cms_user_scoped' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.apiKey).toBeUndefined();
  });
});
