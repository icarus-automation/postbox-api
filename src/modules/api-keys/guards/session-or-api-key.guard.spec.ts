import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';

import type { OrganizationSession } from '../../auth/types/auth.types';
import type { SessionOrApiKeyRequest } from '../types/api-keys.types';
import { ApiKeyGuard } from './api-key.guard';
import { SessionOrApiKeyGuard } from './session-or-api-key.guard';

function contextFor(request: Partial<SessionOrApiKeyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('SessionOrApiKeyGuard', () => {
  const apiKeyGuard = mock<ApiKeyGuard>();
  const guard = new SessionOrApiKeyGuard(apiKeyGuard);

  beforeEach(() => {
    apiKeyGuard.canActivate.mockReset();
  });

  it('lets a request with a session through without an API key', () => {
    const session = {
      session: { activeOrganizationId: 'organization-a' },
    } as OrganizationSession;

    expect(guard.canActivate(contextFor({ session, headers: {} }))).toBe(true);
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('answers a request with neither credential like any session route', () => {
    expect(() =>
      guard.canActivate(contextFor({ session: null, headers: {} })),
    ).toThrow(new UnauthorizedException());
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('checks the API key of a request without a session', async () => {
    const context = contextFor({
      session: null,
      headers: { 'x-api-key': 'cms_revoked' },
    });
    apiKeyGuard.canActivate.mockRejectedValue(
      new UnauthorizedException('Invalid API key'),
    );

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid API key');
    expect(apiKeyGuard.canActivate).toHaveBeenCalledWith(context);
  });
});
