import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import { BlogAccessService, type BlogAccessView } from './blog-access.service';
import { SetWebhookDTO } from './dto/set-webhook.dto';

@OrgRoles(['owner', 'admin'])
@Controller('blog/access')
export class BlogAccessController {
  constructor(private readonly access: BlogAccessService) {}

  @Post('public-key')
  rotatePublicKey(
    @Session() session: OrganizationSession,
  ): Promise<{ publicKey: string }> {
    return this.access.rotatePublicKey(session.session.activeOrganizationId);
  }

  @Get()
  getBlogAccess(@Session() session: OrganizationSession): Promise<BlogAccessView> {
    return this.access.getBlogAccess(session.session.activeOrganizationId);
  }

  @Put('webhook')
  setWebhook(
    @Body() body: SetWebhookDTO,
    @Session() session: OrganizationSession,
  ): Promise<BlogAccessView> {
    return this.access.setWebhook(session.session.activeOrganizationId, body);
  }
}
