import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { UniqueConstraint } from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import type { PublishedTerm, Slug, TermJson } from './document/blog.types';
import type { CreateTagDTO } from './dto/create-tag.dto';
import type { RenameTagDTO } from './dto/rename-tag.dto';
import { writeWithFreeSlug } from './free-slug';
import { PostsService } from './posts.service';
import { termName, termSlug, toPublishedTerm, toTermJson } from './terms';

const TAG_SLUG_CONSTRAINT: UniqueConstraint = {
  index: 'tags_organization_id_slug_key',
  fields: ['organization_id', 'slug'],
};

// postCount counts drafts too, because deleting a tag touches them as well.
const TAG_SELECT = {
  id: true,
  name: true,
  slug: true,
  _count: { select: { posts: true } },
} satisfies Prisma.TagSelect;

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  async getAllTags(organizationId: string): Promise<TermJson[]> {
    const rows = await this.prisma.tag.findMany({
      where: { organizationId },
      select: TAG_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toTermJson);
  }

  // Typing a name that is already there picks that tag, in any case,
  // rather than making a second one.
  async createTag(organizationId: string, body: CreateTagDTO): Promise<TermJson> {
    const name = termName(body.name);
    const existing = await this.prisma.tag.findFirst({
      where: { organizationId, name: { equals: name, mode: 'insensitive' } },
      select: TAG_SELECT,
    });
    if (existing) return toTermJson(existing);
    const row = await this.withFreeSlug(organizationId, termSlug(name), null, (slug) =>
      this.prisma.tag.create({
        data: { organizationId, name, slug },
        select: TAG_SELECT,
      }),
    );
    return toTermJson(row);
  }

  // The slug is made from the name again, so it moves with a rename.
  async renameTag(
    organizationId: string,
    id: string,
    body: RenameTagDTO,
  ): Promise<TermJson | null> {
    const current = await this.findTag(organizationId, id);
    if (!current) return null;
    const name = termName(body.name);
    if (name === current.name) return toTermJson(current);
    const clash = await this.prisma.tag.findFirst({
      where: {
        organizationId,
        id: { not: id },
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Another tag is already called ${name}`);
    const row = await this.withFreeSlug(organizationId, termSlug(name), id, (slug) =>
      this.prisma.tag.update({
        where: { id },
        data: { name, slug },
        select: TAG_SELECT,
      }),
    );
    this.posts.announceUpdatedPosts(organizationId, await this.publishedPostIds(organizationId, id));
    return toTermJson(row);
  }

  // Posts with the tag stay, without it. The database drops the links.
  async deleteTag(organizationId: string, id: string): Promise<TermJson | null> {
    const current = await this.findTag(organizationId, id);
    if (!current) return null;
    const published = await this.publishedPostIds(organizationId, id);
    await this.prisma.tag.delete({ where: { id } });
    this.posts.announceUpdatedPosts(organizationId, published);
    return toTermJson(current);
  }

  // Only tags on a published post, so a name made for a draft stays
  // off the site until the post is out.
  async getPublishedTags(organizationId: string): Promise<PublishedTerm[]> {
    const rows = await this.prisma.tag.findMany({
      where: { organizationId, posts: { some: { post: { status: 'published' } } } },
      select: {
        name: true,
        slug: true,
        _count: { select: { posts: { where: { post: { status: 'published' } } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toPublishedTerm);
  }

  private findTag(organizationId: string, id: string) {
    return this.prisma.tag.findFirst({
      where: { id, organizationId },
      select: TAG_SELECT,
    });
  }

  private async publishedPostIds(organizationId: string, tagId: string): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      where: { organizationId, status: 'published', tags: { some: { tagId } } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private withFreeSlug<T>(
    organizationId: string,
    wanted: Slug,
    tagId: string | null,
    write: (slug: Slug) => Promise<T>,
  ): Promise<T> {
    return writeWithFreeSlug({
      wanted,
      constraint: TAG_SLUG_CONSTRAINT,
      takenSlugs: async (stem) => {
        const rows = await this.prisma.tag.findMany({
          where: {
            organizationId,
            slug: { startsWith: stem },
            ...(tagId ? { id: { not: tagId } } : {}),
          },
          select: { slug: true },
        });
        return rows.map((row) => row.slug);
      },
      write,
    });
  }
}
