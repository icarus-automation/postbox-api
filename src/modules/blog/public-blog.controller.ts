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
import { CategoriesService } from './categories.service';
import { PublicOrganizationId } from './decorators/public-organization-id.decorator';
import type {
  PublicPost,
  PublishedPostSummary,
  PublishedTerm,
} from './document/blog.types';
import { FilterPublishedPostsDTO } from './dto/filter-published-posts.dto';
import { PublicReadKeyGuard } from './guards/public-read-key.guard';
import { PostsService } from './posts.service';
import { PublicBlogInterceptor } from './public-blog.interceptor';
import { TagsService } from './tags.service';

@AllowAnonymous()
@UseGuards(PublicReadKeyGuard)
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
    @PublicOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<PublishedPostSummary>> {
    return this.posts.getPublishedPosts(organizationId, query);
  }

  @Get('posts/:slug')
  async getPublishedPost(
    @Param('slug') slug: string,
    @PublicOrganizationId() organizationId: string,
  ): Promise<PublicPost> {
    const post = await this.posts.getPublishedPost(organizationId, slug);
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  @Get('categories')
  getPublishedCategories(
    @PublicOrganizationId() organizationId: string,
  ): Promise<PublishedTerm[]> {
    return this.categories.getPublishedCategories(organizationId);
  }

  @Get('tags')
  getPublishedTags(@PublicOrganizationId() organizationId: string): Promise<PublishedTerm[]> {
    return this.tags.getPublishedTags(organizationId);
  }
}
