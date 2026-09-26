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
import type {
  EditorPostJson,
  PostSummaryJson,
  PublicBlock,
} from './document/blog.types';
import { CreatePostDTO } from './dto/create-post.dto';
import { FilterPostsDTO } from './dto/filter-posts.dto';
import { PreviewPostDTO } from './dto/preview-post.dto';
import { SavePostDTO } from './dto/save-post.dto';
import { UpdateDraftDTO } from './dto/update-draft.dto';
import { PostsService } from './posts.service';

@OrgRoles(['owner', 'admin', 'member'])
@Controller('blog/posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post('preview')
  previewPost(
    @Body() body: PreviewPostDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ blocks: PublicBlock[] }> {
    return this.posts.previewBlocks(organizationId, body.blocks);
  }

  // Session only. An API key can draft, and a person publishes.
  @Post(':id/publish')
  async publishPost(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<EditorPostJson> {
    const post = await this.posts.publishPost(
      session.session.activeOrganizationId,
      id,
      new Date(),
    );
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // Session only, same as publish.
  @Post(':id/unpublish')
  async unpublishPost(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<EditorPostJson> {
    const post = await this.posts.unpublishPost(session.session.activeOrganizationId, id);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // A draft from an API key gets its slug from the title, the same as one
  // started in the editor.
  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post()
  createPost(
    @Body() body: CreatePostDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorPostJson> {
    return this.posts.createDraft(organizationId, body);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllPosts(
    @Query() query: FilterPostsDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<PostSummaryJson>> {
    return this.posts.getAllPosts(organizationId, query);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get(':id')
  async getPost(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorPostJson> {
    const post = await this.posts.getPost(organizationId, id);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Patch(':id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: UpdateDraftDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<EditorPostJson> {
    const post = await this.posts.updateDraft(organizationId, id, body);
    if (post === 'published') throw new ConflictException('Post is published');
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // Session only. Published posts are saved here, and a draft patch of one is a 409.
  @Put(':id')
  async savePost(
    @Param('id') id: string,
    @Body() body: SavePostDTO,
    @Session() session: OrganizationSession,
  ): Promise<EditorPostJson> {
    const post = await this.posts.savePost(session.session.activeOrganizationId, id, body);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }
}
