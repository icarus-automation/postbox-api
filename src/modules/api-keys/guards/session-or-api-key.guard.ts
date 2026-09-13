import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { SessionOrApiKeyRequest } from '../types/api-keys.types';
import { API_KEY_HEADER, ApiKeyGuard } from './api-key.guard';

// For read routes that both the client and machines call. Apply it through
// @SessionOrApiKey(), which adds the @OptionalAuth() and @OrgRoles() this relies
// on: a session reaching here has already passed the role check.
@Injectable()
export class SessionOrApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyGuard: ApiKeyGuard) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SessionOrApiKeyRequest>();

    if (request.session) return true;

    // A signed-out browser should read the same 401 as on any session route.
    if (request.headers[API_KEY_HEADER] === undefined) {
      throw new UnauthorizedException();
    }

    return this.apiKeyGuard.canActivate(context);
  }
}
