import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import type { IntegrationKeyService } from '../../integration/integration-key.service';
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
  const integrationKeys = mock<IntegrationKeyService>();
  const guard = new SessionOrApiKeyGuard(apiKeyGuard, integrationKeys);

  beforeEach(() => {
    mockReset(apiKeyGuard);
    mockReset(integrationKeys);
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
    expect(integrationKeys.authenticate).not.toHaveBeenCalled();
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

  describe('an integration key', () => {
    it('is turned away with a 403 when it is a real key', async () => {
      integrationKeys.authenticate.mockResolvedValue('organization-a');
      const context = contextFor({
        session: null,
        headers: { 'x-integration-key': 'pbi_live' },
      });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(integrationKeys.authenticate).toHaveBeenCalledWith('pbi_live');
      expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
    });

    it('reads a 401 when it is not a real key, such as one that was rotated away', async () => {
      integrationKeys.authenticate.mockResolvedValue(null);
      const context = contextFor({
        session: null,
        headers: { 'x-integration-key': 'pbi_old' },
      });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('never gives a request an API key principal', async () => {
      integrationKeys.authenticate.mockResolvedValue('organization-a');
      const request: Partial<SessionOrApiKeyRequest> = {
        session: null,
        headers: { 'x-integration-key': 'pbi_live' },
      };

      await expect(guard.canActivate(contextFor(request))).rejects.toBeDefined();
      expect(request.apiKey).toBeUndefined();
      expect(request.integrationKey).toBeUndefined();
    });

    it('does not help a request that also sends an admin API key', async () => {
      apiKeyGuard.canActivate.mockRejectedValue(
        new UnauthorizedException('Invalid API key'),
      );
      const context = contextFor({
        session: null,
        headers: { 'x-api-key': 'cms_bad', 'x-integration-key': 'pbi_live' },
      });

      await expect(guard.canActivate(context)).rejects.toThrow('Invalid API key');
      expect(integrationKeys.authenticate).not.toHaveBeenCalled();
    });

    it('does not matter to a signed-in person', () => {
      const session = {
        session: { activeOrganizationId: 'organization-a' },
      } as OrganizationSession;

      expect(
        guard.canActivate(
          contextFor({ session, headers: { 'x-integration-key': 'pbi_live' } }),
        ),
      ).toBe(true);
      expect(integrationKeys.authenticate).not.toHaveBeenCalled();
    });
  });
});
