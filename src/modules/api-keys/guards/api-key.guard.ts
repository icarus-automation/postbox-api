import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';

import { ORGANIZATION_API_KEY_CONFIG_ID } from '../../auth/api-key-config';
import type { Auth } from '../../auth/auth';
import type { ApiKeyRequest } from '../types/api-keys.types';

export const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService<Auth>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const header = request.headers[API_KEY_HEADER];
    const key = typeof header === 'string' ? header.trim() : '';

    if (!key) throw new UnauthorizedException('Missing API key');

    // Better Auth answers with valid: false for an unknown, disabled or expired
    // key, and bumps the key's last request on the way through. Pinning the
    // configuration keeps this to organization-owned keys, so referenceId below
    // is always an organization.
    const { valid, key: verified } = await this.authService.api.verifyApiKey({
      body: { key, configId: ORGANIZATION_API_KEY_CONFIG_ID },
    });

    if (!valid || !verified) throw new UnauthorizedException('Invalid API key');

    request.apiKey = { id: verified.id, organizationId: verified.referenceId };

    return true;
  }
}
