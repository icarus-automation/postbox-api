import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { SessionOrApiKeyRequest } from '../types/api-keys.types';

// The organization a SessionOrApiKeyGuard route acts for: the API key's own, or
// the session's active one. Routes using it must run that guard.
export const CurrentOrganizationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<SessionOrApiKeyRequest>();
    const organizationId =
      request.apiKey?.organizationId ??
      request.session?.session.activeOrganizationId;

    if (!organizationId) throw new UnauthorizedException();

    return organizationId;
  },
);
