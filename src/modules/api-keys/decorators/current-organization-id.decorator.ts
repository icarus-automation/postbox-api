import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { SessionOrApiKeyRequest } from '../types/api-keys.types';

// The organization a request acts for: the API key's own, the integration key's, or
// the session's active one. The route has to run the guard that sets one of them.
// SessionOrApiKeyGuard never lets an integration key through, so a route behind it
// only ever sees the first and the last.
export const CurrentOrganizationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<SessionOrApiKeyRequest>();
    const organizationId =
      request.apiKey?.organizationId ??
      request.integrationKey?.organizationId ??
      request.session?.session.activeOrganizationId;

    if (!organizationId) throw new UnauthorizedException();

    return organizationId;
  },
);
