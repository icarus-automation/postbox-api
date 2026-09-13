import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ApiKeysService } from '../api-keys.service';
import type { ApiKeyRequest } from '../types/api-keys.types';

export const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const header = request.headers[API_KEY_HEADER];
    const key = typeof header === 'string' ? header.trim() : '';

    if (!key) throw new UnauthorizedException('Missing API key');

    const apiKey = await this.apiKeysService.authenticateApiKey(key);

    if (!apiKey) throw new UnauthorizedException('Invalid API key');

    request.apiKey = apiKey;

    return true;
  }
}
