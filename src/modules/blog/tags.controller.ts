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
import type { TermJson } from './document/blog.types';
import { CreateTagDTO } from './dto/create-tag.dto';
import { RenameTagDTO } from './dto/rename-tag.dto';
import { TagsService } from './tags.service';

// Owners and admins rename and delete. Anyone writing a post reads the list and
// adds to it from the editor.
@OrgRoles(['owner', 'admin'])
@Controller('blog/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  // An agent reads the list too, to tag a draft it files.
  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllTags(@CurrentOrganizationId() organizationId: string): Promise<TermJson[]> {
    return this.tags.getAllTags(organizationId);
  }

  @OrgRoles(['owner', 'admin', 'member'])
  @Post()
  createTag(
    @Body() body: CreateTagDTO,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    return this.tags.createTag(session.session.activeOrganizationId, body);
  }

  @Patch(':id')
  async renameTag(
    @Param('id') id: string,
    @Body() body: RenameTagDTO,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    const tag = await this.tags.renameTag(session.session.activeOrganizationId, id, body);
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  @Delete(':id')
  async deleteTag(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    const tag = await this.tags.deleteTag(session.session.activeOrganizationId, id);
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }
}
