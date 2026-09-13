import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import type { ApiKeyPrincipal, ApiKeyRequest } from '../types/api-keys.types';

// Reads what ApiKeyGuard put on the request. Routes using it must run that guard.
export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyPrincipal => {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    if (!request.apiKey) throw new UnauthorizedException('Missing API key');

    return request.apiKey;
  },
);
