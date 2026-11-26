import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { isUniqueConstraintViolation, type UniqueConstraint } from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import type { PublishedTerm, Slug, TermJson } from './document/blog.types';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './document/slugs';
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
  // rather than making a second one. A slug on that call is ignored.
  async createCategory(organizationId: string, body: CreateCategoryDTO): Promise<TermJson> {
    const name = termName(body.name);
    const existing = await this.prisma.category.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: CATEGORY_SELECT,
    });
    if (existing) return toTermJson(existing);
    const explicit = chosenCategorySlug(body.slug);
    if (explicit) {
      await this.assertSlugAvailable(organizationId, explicit, null);
      return toTermJson(await this.insertCategory(organizationId, name, explicit));
    }
    const row = await this.withFreeSlug(organizationId, termSlug(name), null, (slug) =>
      this.prisma.category.create({
        data: { organizationId, name, slug },
        select: CATEGORY_SELECT,
      }),
    );
    return toTermJson(row);
  }

  // The slug stays until a write sets a new one. A rename of the name leaves it.
  async renameCategory(
    organizationId: string,
    id: string,
    body: RenameCategoryDTO,
  ): Promise<TermJson | null> {
    const current = await this.findCategory(organizationId, id);
    if (!current) return null;
    const name = termName(body.name);
    const slug = chosenCategorySlug(body.slug) ?? (current.slug as Slug);
    if (name === current.name && slug === current.slug) return toTermJson(current);
    if (name !== current.name) {
      const clash = await this.prisma.category.findFirst({
        where: {
          organizationId,
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (clash) throw new ConflictException(`Another category is already called ${name}`);
    }
    if (slug !== current.slug) await this.assertSlugAvailable(organizationId, slug, id);
    const row = await this.updateCategory(id, name, slug);
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

  private async insertCategory(organizationId: string, name: string, slug: Slug) {
    try {
      return await this.prisma.category.create({
        data: { organizationId, name, slug },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, CATEGORY_SLUG_CONSTRAINT)) {
        throw new ConflictException(`Another category already uses ${slug}`);
      }
      throw error;
    }
  }

  private async updateCategory(id: string, name: string, slug: Slug) {
    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name, slug },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, CATEGORY_SLUG_CONSTRAINT)) {
        throw new ConflictException(`Another category already uses ${slug}`);
      }
      throw error;
    }
  }

  private async assertSlugAvailable(
    organizationId: string,
    slug: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.category.findFirst({
      where: {
        organizationId,
        slug,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Another category already uses ${slug}`);
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

function chosenCategorySlug(slug: string | undefined): Slug | undefined {
  if (slug === undefined) return undefined;
  const trimmed = slug.trim();
  if (trimmed.length === 0) return undefined;
  if (!SLUG_PATTERN.test(trimmed) || trimmed.length > SLUG_MAX_LENGTH) {
    throw new BadRequestException('Slug is invalid');
  }
  return trimmed as Slug;
}
