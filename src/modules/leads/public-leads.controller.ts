import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

// A website files a lead here with its integration key, straight from the
// browser if it likes. Only the id comes back: the lead itself lists every field
// key the organization has, and a form has no use for them.
@AllowAnonymous()
@UseGuards(IntegrationKeyGuard)
// Open to any visitor of any site, so a tighter cap than the rest of the API.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('public/:orgSlug/leads')
export class PublicLeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async submitLead(
    @Body() body: CreateLeadDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ id: string }> {
    const lead = await this.leadsService.createLead(organizationId, body);
    return { id: lead.id };
  }
}
