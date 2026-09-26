import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { SessionOrApiKey } from '../api-keys/decorators/session-or-api-key.decorator';
import type { OrganizationSession } from '../auth/types/auth.types';
import { ContentEntriesService } from './content-entries.service';
import type { EditorEntryJson, PublicBlock } from './document/content.types';
import { CreateContentDTO } from './dto/create-content.dto';
import { FilterContentDTO } from './dto/filter-content.dto';
import { PreviewContentDTO } from './dto/preview-content.dto';
import { SaveContentDTO } from './dto/save-content.dto';
import { UpdateDraftDTO } from './dto/update-draft.dto';

@OrgRoles(['owner', 'admin', 'member'])
@Controller('content')
export class ContentEntriesController {
  constructor(private readonly content: ContentEntriesService) {}

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post('preview')
  previewContent(
    @Body() body: PreviewContentDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ blocks: PublicBlock[] }> {
    return this.content.preview(organizationId, body.blocks);
  }

  // Session only. An API key can draft, and a person publishes.
  @Post(':id/publish')
  async publishContent(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<EditorEntryJson> {
    const entry = await this.content.publish(
      session.session.activeOrganizationId,
      id,
      new Date(),
    );
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }

  // Session only, same as publish.
  @Post(':id/unpublish')
  async unpublishContent(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<EditorEntryJson> {
    const entry = await this.content.unpublish(
      session.session.activeOrganizationId,
      id,
    );
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post()
  createContent(
    @Body() body: CreateContentDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorEntryJson> {
    return this.content.createDraft(organizationId, body);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllContent(
    @Query() query: FilterContentDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<EditorEntryJson>> {
    return this.content.list(organizationId, query);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get(':id')
  async getContent(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorEntryJson> {
    const entry = await this.content.get(organizationId, id);
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Patch(':id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: UpdateDraftDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorEntryJson> {
    const entry = await this.content.updateDraft(organizationId, id, body);
    if (entry === 'published') throw new ConflictException('Content is published');
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }

  // Session only. Published rows are saved here, and a draft patch of one is a 409.
  @Put(':id')
  async saveContent(
    @Param('id') id: string,
    @Body() body: SaveContentDTO,
    @Session() session: OrganizationSession,
  ): Promise<EditorEntryJson> {
    const entry = await this.content.saveFromEditor(
      session.session.activeOrganizationId,
      id,
      body,
    );
    if (!entry) throw new NotFoundException('Content not found');
    return entry;
  }
}
