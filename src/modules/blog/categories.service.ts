import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { UniqueConstraint } from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import type { PublishedTerm, Slug, TermJson } from './document/blog.types';
import type { CreateCategoryDTO } from './dto/create-category.dto';
import type { RenameCategoryDTO } from './dto/rename-category.dto';
import { writeWithFreeSlug } from './free-slug';
import { PostsService } from './posts.service';
import { termName, termSlug, toPublishedTerm, toTermJson } from './terms';

const CATEGORY_SLUG_CONSTRAINT: UniqueConstraint = {
  index: 'categories_organization_id_slug_key',
  fields: ['organization_id', 'slug'],
};

// postCount counts drafts too, because deleting a category touches them as well.
const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  _count: { select: { posts: true } },
} satisfies Prisma.CategorySelect;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  async getAllCategories(organizationId: string): Promise<TermJson[]> {
    const rows = await this.prisma.category.findMany({
      where: { organizationId },
      select: CATEGORY_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toTermJson);
  }

  // Typing a name that is already there picks that category, in any case,
  // rather than making a second one.
  async createCategory(organizationId: string, body: CreateCategoryDTO): Promise<TermJson> {
    const name = termName(body.name);
    const existing = await this.prisma.category.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: CATEGORY_SELECT,
    });
    if (existing) return toTermJson(existing);
    const row = await this.withFreeSlug(organizationId, termSlug(name), null, (slug) =>
      this.prisma.category.create({
        data: { organizationId, name, slug },
        select: CATEGORY_SELECT,
      }),
    );
    return toTermJson(row);
  }

  // The slug is made from the name again, so it moves with a rename.
  async renameCategory(
    organizationId: string,
    id: string,
    body: RenameCategoryDTO,
  ): Promise<TermJson | null> {
    const current = await this.findCategory(organizationId, id);
    if (!current) return null;
    const name = termName(body.name);
    if (name === current.name) return toTermJson(current);
    const clash = await this.prisma.category.findFirst({
      where: {
        organizationId,
        id: { not: id },
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Another category is already called ${name}`);
    const row = await this.withFreeSlug(organizationId, termSlug(name), id, (slug) =>
      this.prisma.category.update({
        where: { id },
        data: { name, slug },
        select: CATEGORY_SELECT,
      }),
    );
    this.posts.announceUpdatedPosts(organizationId, await this.publishedPostIds(organizationId, id));
    return toTermJson(row);
  }

  // Posts in the category stay, without a category. The database clears them.
  async deleteCategory(organizationId: string, id: string): Promise<TermJson | null> {
    const current = await this.findCategory(organizationId, id);
    if (!current) return null;
    const published = await this.publishedPostIds(organizationId, id);
    await this.prisma.category.delete({ where: { id } });
    this.posts.announceUpdatedPosts(organizationId, published);
    return toTermJson(current);
  }

  // Only categories with a published post, so a name made for a draft stays
  // off the site until the post is out.
  async getPublishedCategories(organizationId: string): Promise<PublishedTerm[]> {
    const rows = await this.prisma.category.findMany({
      where: { organizationId, posts: { some: { status: 'published' } } },
      select: {
        name: true,
        slug: true,
        _count: { select: { posts: { where: { status: 'published' } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toPublishedTerm);
  }

  private findCategory(organizationId: string, id: string) {
    return this.prisma.category.findFirst({
      where: { id, organizationId },
      select: CATEGORY_SELECT,
    });
  }

  private async publishedPostIds(organizationId: string, categoryId: string): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      where: { organizationId, categoryId, status: 'published' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private withFreeSlug<T>(
    organizationId: string,
    wanted: Slug,
    categoryId: string | null,
    write: (slug: Slug) => Promise<T>,
  ): Promise<T> {
    return writeWithFreeSlug({
      wanted,
      constraint: CATEGORY_SLUG_CONSTRAINT,
      takenSlugs: async (stem) => {
        const rows = await this.prisma.category.findMany({
          where: {
            organizationId,
            slug: { startsWith: stem },
            ...(categoryId ? { id: { not: categoryId } } : {}),
          },
          select: { slug: true },
        });
        return rows.map((row) => row.slug);
      },
      write,
    });
  }
}
