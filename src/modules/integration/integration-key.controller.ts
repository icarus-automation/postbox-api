import { Controller, Get, Post } from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import { IntegrationKeyService } from './integration-key.service';
import type { IntegrationKeyView } from './types/integration-key.types';

// Session only. The key is safe in website code, but the people who copy it and
// cut it off are the owners and admins.
@OrgRoles(['owner', 'admin'])
@Controller('integration-key')
export class IntegrationKeyController {
  constructor(private readonly keys: IntegrationKeyService) {}

  @Get()
  getIntegrationKey(@Session() session: OrganizationSession): Promise<IntegrationKeyView> {
    return this.keys.getIntegrationKey(session.session.activeOrganizationId);
  }

  @Post('rotate')
  rotateIntegrationKey(@Session() session: OrganizationSession): Promise<IntegrationKeyView> {
    return this.keys.rotateIntegrationKey(session.session.activeOrganizationId);
  }
}
