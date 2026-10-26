import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  API_KEY_HEADER,
  ApiKeyGuard,
} from '../../api-keys/guards/api-key.guard';
import type { ApiKeyRequest } from '../../api-keys/types/api-keys.types';
import { readIntegrationKey } from '../../integration/integration-key';
import { IntegrationKeyService } from '../../integration/integration-key.service';

// Who may file a lead: an admin API key, as before, or an integration key. A request
// that sends an admin key is judged on it alone, so a bad one is never rescued by
// an integration key beside it.
@Injectable()
export class LeadIntakeGuard implements CanActivate {
  constructor(
    private readonly apiKeyGuard: ApiKeyGuard,
    private readonly integrationKeys: IntegrationKeyService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const integrationKey = readIntegrationKey(request.headers);

    if (
      request.headers[API_KEY_HEADER] !== undefined ||
      integrationKey === undefined
    ) {
      return this.apiKeyGuard.canActivate(context);
    }

    return this.admitIntegrationKey(request, integrationKey);
  }

  private async admitIntegrationKey(
    request: ApiKeyRequest,
    rawKey: string,
  ): Promise<boolean> {
    const organizationId = await this.integrationKeys.authenticate(rawKey);
    if (!organizationId) {
      throw new UnauthorizedException('Invalid integration key');
    }

    request.integrationKey = { organizationId };
    return true;
  }
}
