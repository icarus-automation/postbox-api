import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { readIntegrationKey } from '../../integration/integration-key';
import { IntegrationKeyService } from '../../integration/integration-key.service';
import type { SessionOrApiKeyRequest } from '../types/api-keys.types';
import { API_KEY_HEADER, ApiKeyGuard } from './api-key.guard';

// For read routes that both the client and machines call. Apply it through
// @SessionOrApiKey(), which adds the @OptionalAuth() and @OrgRoles() this relies
// on: a session reaching here has already passed the role check.
@Injectable()
export class SessionOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly integrationKeys: IntegrationKeyService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SessionOrApiKeyRequest>();

    if (request.session) return true;

    if (request.headers[API_KEY_HEADER] !== undefined) {
      return this.apiKeyGuard.canActivate(context);
    }

    // A website's key is recognised here and turned away, so a caller who sent it
    // by mistake reads a 403 rather than the 401 of someone who sent nothing.
    const integrationKey = readIntegrationKey(request.headers);
    if (integrationKey !== undefined) {
      return this.refuseIntegrationKey(integrationKey);
    }

    // A signed-out browser should read the same 401 as on any session route.
    throw new UnauthorizedException();
  }

  private async refuseIntegrationKey(rawKey: string): Promise<never> {
    const organizationId = await this.integrationKeys.authenticate(rawKey);
    if (!organizationId) {
      throw new UnauthorizedException('Invalid integration key');
    }
    throw new ForbiddenException(
      'An integration key cannot use this route. Use an admin API key.',
    );
  }
}
