import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { readIntegrationKey } from './integration-key';
import { IntegrationKeyService } from './integration-key.service';
import type { IntegrationKeyRequest } from './types/integration-key.types';

// For the routes under /public/:orgSlug, which a website calls. The key has to be
// the one the organization in the path owns.
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly keys: IntegrationKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationKeyRequest>();
    const rawKey = readIntegrationKey(request.headers);
    const orgSlug = (request.params as { orgSlug?: string } | undefined)?.orgSlug;
    if (!rawKey || !orgSlug) throw new UnauthorizedException();

    const organizationId = await this.keys.authenticate(rawKey, orgSlug);
    if (!organizationId) throw new UnauthorizedException();

    request.integrationKey = { organizationId };
    return true;
  }
}
