import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { CategoriesService } from './categories.service';
import type {
  PublicPost,
  PublishedPostSummary,
  PublishedTerm,
} from './document/blog.types';
import { FilterPublishedPostsDTO } from './dto/filter-published-posts.dto';
import { PostsService } from './posts.service';
import { PublicBlogInterceptor } from './public-blog.interceptor';
import { TagsService } from './tags.service';

@AllowAnonymous()
@UseGuards(IntegrationKeyGuard)
@UseInterceptors(PublicBlogInterceptor)
@Controller('public/:orgSlug/blog')
export class PublicBlogController {
  constructor(
    private readonly posts: PostsService,
    private readonly categories: CategoriesService,
    private readonly tags: TagsService,
  ) {}

  @Get('posts')
  getPublishedPosts(
    @Query() query: FilterPublishedPostsDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<PublishedPostSummary>> {
    return this.posts.getPublishedPosts(organizationId, query);
  }

  @Get('posts/:slug')
  async getPublishedPost(
    @Param('slug') slug: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PublicPost> {
    const post = await this.posts.getPublishedPost(organizationId, slug);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  @Get('categories')
  getPublishedCategories(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PublishedTerm[]> {
    return this.categories.getPublishedCategories(organizationId);
  }

  @Get('tags')
  getPublishedTags(@CurrentOrganizationId() organizationId: string): Promise<PublishedTerm[]> {
    return this.tags.getPublishedTags(organizationId);
  }
}
