import { Controller, Get, NotFoundException, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { ContentEntriesService } from './content-entries.service';
import { PublicOrganizationId } from './decorators/public-organization-id.decorator';
import type { PublicEntry, PublishedSummary } from './document/content.types';
import { FilterPublishedDTO } from './dto/filter-published.dto';
import { PublicReadKeyGuard } from './guards/public-read-key.guard';
import { PublicContentInterceptor } from './public-content.interceptor';

@AllowAnonymous()
@UseGuards(PublicReadKeyGuard)
@UseInterceptors(PublicContentInterceptor)
@Controller('public/:orgSlug/content')
export class PublicContentController {
  constructor(private readonly content: ContentEntriesService) {}

  @Get()
  getPublishedContent(
    @Query() query: FilterPublishedDTO,
    @PublicOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<PublishedSummary>> {
    return this.content.listPublished(organizationId, query);
  }

  @Get(':slug')
  async getPublishedContentBySlug(
    @Param('slug') slug: string,
    @PublicOrganizationId() organizationId: string,
  ): Promise<PublicEntry> {
    const entry = await this.content.getPublishedBySlug(organizationId, slug);
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }
}
