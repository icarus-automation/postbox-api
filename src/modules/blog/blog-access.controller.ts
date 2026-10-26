import { Body, Controller, Get, Put } from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import { BlogAccessService, type BlogAccessView } from './blog-access.service';
import { SetWebhookDTO } from './dto/set-webhook.dto';

@OrgRoles(['owner', 'admin'])
@Controller('blog/access')
export class BlogAccessController {
  constructor(private readonly access: BlogAccessService) {}

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
