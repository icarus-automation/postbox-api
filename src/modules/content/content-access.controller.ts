import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import { ContentAccessService, type ContentAccessView } from './content-access.service';
import { SetWebhookDTO } from './dto/set-webhook.dto';

@OrgRoles(['owner', 'admin'])
@Controller('content-access')
export class ContentAccessController {
  constructor(private readonly access: ContentAccessService) {}

  @Post('public-key')
  rotatePublicKey(
    @Session() session: OrganizationSession,
  ): Promise<{ publicKey: string }> {
    return this.access.rotatePublicKey(session.session.activeOrganizationId);
  }

  @Get()
  getContentAccess(@Session() session: OrganizationSession): Promise<ContentAccessView> {
    return this.access.get(session.session.activeOrganizationId);
  }

  @Put('webhook')
  setWebhook(
    @Body() body: SetWebhookDTO,
    @Session() session: OrganizationSession,
  ): Promise<ContentAccessView> {
    return this.access.setWebhook(session.session.activeOrganizationId, body);
  }
}
