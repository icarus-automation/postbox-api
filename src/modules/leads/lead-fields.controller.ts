import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { SessionOrApiKey } from '../api-keys/decorators/session-or-api-key.decorator';
import type { OrganizationSession } from '../auth/types/auth.types';
import { CreateLeadFieldDTO } from './dto/create-lead-field.dto';
import { UpdateLeadFieldDTO } from './dto/update-lead-field.dto';
import { LeadFieldsService } from './lead-fields.service';
import type { LeadField } from './types/leads.types';

@OrgRoles(['owner', 'admin'])
@Controller('leads/fields')
export class LeadFieldsController {
  constructor(private readonly leadFieldsService: LeadFieldsService) {}

  // The client and agents read the same list, so an agent can see which keys a
  // lead takes before it posts one. Any member can read it with a session.
  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllLeadFields(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<LeadField[]> {
    return this.leadFieldsService.getAllLeadFields(organizationId);
  }

  @Post()
  createLeadField(
    @Body() body: CreateLeadFieldDTO,
    @Session() session: OrganizationSession,
  ): Promise<LeadField> {
    return this.leadFieldsService.createLeadField(
      session.session.activeOrganizationId,
      body,
    );
  }

  @Patch(':id')
  async updateLeadField(
    @Param('id') id: string,
    @Body() body: UpdateLeadFieldDTO,
    @Session() session: OrganizationSession,
  ): Promise<LeadField> {
    const field = await this.leadFieldsService.updateLeadField(
      session.session.activeOrganizationId,
      id,
      body,
    );
    if (!field) throw new NotFoundException('Lead field not found');
    return field;
  }

  @Delete(':id')
  async deleteLeadField(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<LeadField> {
    const field = await this.leadFieldsService.deleteLeadField(
      session.session.activeOrganizationId,
      id,
    );
    if (!field) throw new NotFoundException('Lead field not found');
    return field;
  }
}
