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
import { CategoriesService } from './categories.service';
import type { TermJson } from './document/blog.types';
import { CreateCategoryDTO } from './dto/create-category.dto';
import { RenameCategoryDTO } from './dto/rename-category.dto';

// Owners and admins rename and delete. Anyone writing a post reads the list and
// adds to it from the editor.
@OrgRoles(['owner', 'admin'])
@Controller('blog/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // An agent reads the list too, to file a draft under a category.
  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Get()
  getAllCategories(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TermJson[]> {
    return this.categories.getAllCategories(organizationId);
  }

  @OrgRoles(['owner', 'admin', 'member'])
  @Post()
  createCategory(
    @Body() body: CreateCategoryDTO,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    return this.categories.createCategory(session.session.activeOrganizationId, body);
  }

  @Patch(':id')
  async renameCategory(
    @Param('id') id: string,
    @Body() body: RenameCategoryDTO,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    const category = await this.categories.renameCategory(
      session.session.activeOrganizationId,
      id,
      body,
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  @Delete(':id')
  async deleteCategory(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<TermJson> {
    const category = await this.categories.deleteCategory(
      session.session.activeOrganizationId,
      id,
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
