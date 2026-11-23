import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AllowAnonymous,
  OrgRoles,
  Session,
} from '@thallesp/nestjs-better-auth';
import type { LeadChannel } from '@prisma/client';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { SessionOrApiKey } from '../api-keys/decorators/session-or-api-key.decorator';
import type { OrganizationSession } from '../auth/types/auth.types';
import { KeyLeadChannel } from './decorators/lead-channel.decorator';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { FilterLeadsDTO } from './dto/filter-leads.dto';
import { SetLeadArchivedDTO } from './dto/set-lead-archived.dto';
import { SetLeadStatusDTO } from './dto/set-lead-status.dto';
import { UpdateLeadValuesDTO } from './dto/update-lead-values.dto';
import { LeadIntakeGuard } from './guards/lead-intake.guard';
import { LeadsService } from './leads.service';
import type { OrganizationLead } from './types/leads.types';

@OrgRoles(['owner', 'admin', 'member'])
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // Machine callers only: an admin API key or an integration key replaces the
  // browser session here. The key also decides the channel.
  @AllowAnonymous()
  @UseGuards(LeadIntakeGuard)
  @Post()
  createLead(
    @Body() body: CreateLeadDTO,
    @CurrentOrganizationId() organizationId: string,
    @KeyLeadChannel() channel: LeadChannel,
  ): Promise<OrganizationLead> {
    return this.leadsService.createLead(organizationId, channel, body);
  }

  // Agents read with their API key too, so they can look up a lead before filing
  // it again.
  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllLeads(
    @Query() query: FilterLeadsDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<OrganizationLead>> {
    return this.leadsService.getAllLeads(organizationId, query);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get(':id')
  async getLead(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<OrganizationLead> {
    const lead = await this.leadsService.getLead(organizationId, id);
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  // Session only. Status is read-only here, so editing values never moves a lead.
  @Patch(':id')
  async updateLeadValues(
    @Param('id') id: string,
    @Body() body: UpdateLeadValuesDTO,
    @Session() session: OrganizationSession,
  ): Promise<OrganizationLead> {
    const lead = await this.leadsService.updateLeadValues(
      session.session.activeOrganizationId,
      id,
      body,
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  // Session only. Agents file every lead as new and a person moves it along, so
  // this route never accepts an API key.
  @Patch(':id/status')
  async setLeadStatus(
    @Param('id') id: string,
    @Body() body: SetLeadStatusDTO,
    @Session() session: OrganizationSession,
  ): Promise<OrganizationLead> {
    const lead = await this.leadsService.setLeadStatus(
      session.session.activeOrganizationId,
      id,
      body.status,
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  // Session only, for the same reason as status: an agent files leads, a person
  // decides which ones leave the inbox.
  @Patch(':id/archive')
  async setLeadArchived(
    @Param('id') id: string,
    @Body() body: SetLeadArchivedDTO,
    @Session() session: OrganizationSession,
  ): Promise<OrganizationLead> {
    const lead = await this.leadsService.setLeadArchived(
      session.session.activeOrganizationId,
      id,
      body.isArchived,
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
