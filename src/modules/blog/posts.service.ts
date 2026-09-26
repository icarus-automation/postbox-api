import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import type { UniqueConstraint } from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import { BlogWebhook } from './blog-webhook.service';
import {
  DraftRejected,
  type BlogWebhookEvent,
  type EditorPostJson,
  type OrganizationId,
  type PostDocument,
  type PostId,
  type PostSummaryJson,
  type PublicBlock,
  type PublicPost,
  type PublishedPostSummary,
  type Slug,
  type TermRef,
} from './document/blog.types';
import {
  collectMediaIds,
  parseBlocks,
  readBlocks,
  toPublicBlocks,
} from './document/block-registry';
import {
  applyFields,
  blankDraft,
  changedInPublic,
  publicationFromRow,
  publicTerm,
  publishedEvent,
  sortTerms,
  toEditorJson,
  toPublicPost,
  unpublishedEvent,
  updatedEvent,
  type PostRefs,
} from './document/post-document';
import type { CreatePostDTO } from './dto/create-post.dto';
import type { FilterPostsDTO } from './dto/filter-posts.dto';
import type { FilterPublishedPostsDTO } from './dto/filter-published-posts.dto';
import type { SavePostDTO } from './dto/save-post.dto';
import type { UpdateDraftDTO } from './dto/update-draft.dto';
import { writeWithFreeSlug } from './free-slug';
import { MediaService } from './media.service';
import { termRef } from './terms';

const POST_SLUG_CONSTRAINT: UniqueConstraint = {
  index: 'posts_organization_id_slug_key',
  fields: ['organization_id', 'slug'],
};

const TERM_SELECT = { id: true, name: true, slug: true } as const;

const POST_INCLUDE = {
  ogImage: true,
  coverImage: true,
  category: { select: TERM_SELECT },
  tags: { select: { tag: { select: TERM_SELECT } } },
} satisfies Prisma.PostInclude;

// Everything a list row shows. The blocks stay behind.
const SUMMARY_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  coverImage: true,
  category: { select: TERM_SELECT },
  tags: { select: { tag: { select: TERM_SELECT } } },
} satisfies Prisma.PostSelect;

type StoredPost = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;
type StoredSummary = Prisma.PostGetPayload<{ select: typeof SUMMARY_SELECT }>;

type PostLinks = {
  blocks?: unknown;
  ogImageId?: string | null;
  coverImageId?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
};

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly webhooks: BlogWebhook,
  ) {}

  async getAllPosts(
    organizationId: string,
    query: FilterPostsDTO,
  ): Promise<PaginatedResponse<PostSummaryJson>> {
    const where: Prisma.PostWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...this.termFilter(query),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map((row) => this.toSummaryJson(row)),
      meta: this.meta(total, query.page, query.limit),
    };
  }

  async getPost(organizationId: string, id: string): Promise<EditorPostJson | null> {
    const row = await this.findRow(organizationId, id);
    return row ? toEditorJson(this.toDocument(row)) : null;
  }

  async createDraft(
    organizationId: string,
    body: CreatePostDTO,
  ): Promise<EditorPostJson> {
    const doc = applyFields(
      blankDraft(organizationId as OrganizationId),
      body,
      await this.refsFor(organizationId, body),
    );
    const row = await this.withFreeSlug(organizationId, doc.slug, null, (slug) =>
      this.prisma.post.create({
        data: {
          organizationId,
          ...this.columns(doc, slug),
          status: 'draft',
          publishedAt: null,
          tags: { create: doc.tags.map((tag) => ({ tagId: tag.id })) },
        },
        include: POST_INCLUDE,
      }),
    );
    return toEditorJson(this.toDocument(row));
  }

  async updateDraft(
    organizationId: string,
    id: string,
    body: UpdateDraftDTO,
  ): Promise<EditorPostJson | 'published' | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const before = this.toDocument(row);
    if (before.publication.status !== 'draft') return 'published';
    const refs = await this.refsFor(organizationId, body);
    const saved = await this.write(before, applyFields(before, body, refs), refs);
    return toEditorJson(saved);
  }

  // A published post is saved here too, and the site hears about it when the
  // post reads differently afterwards.
  async savePost(
    organizationId: string,
    id: string,
    body: SavePostDTO,
  ): Promise<EditorPostJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const before = this.toDocument(row);
    const refs = await this.refsFor(organizationId, body);
    const saved = await this.write(before, applyFields(before, body, refs), refs);
    if (changedInPublic(before, saved)) {
      const slug = await this.organizationSlug(organizationId);
      this.emit(organizationId, updatedEvent(saved, slug));
    }
    return toEditorJson(saved);
  }

  async publishPost(
    organizationId: string,
    id: string,
    now: Date,
  ): Promise<EditorPostJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    if (row.status === 'published') return toEditorJson(this.toDocument(row));
    const saved = this.toDocument(
      await this.prisma.post.update({
        where: { id: row.id },
        data: { status: 'published', publishedAt: now },
        include: POST_INCLUDE,
      }),
    );
    const slug = await this.organizationSlug(organizationId);
    this.emit(organizationId, publishedEvent(saved, slug));
    return toEditorJson(saved);
  }

  async unpublishPost(organizationId: string, id: string): Promise<EditorPostJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    if (row.status === 'draft') return toEditorJson(this.toDocument(row));
    const saved = this.toDocument(
      await this.prisma.post.update({
        where: { id: row.id },
        data: { status: 'draft', publishedAt: null },
        include: POST_INCLUDE,
      }),
    );
    const slug = await this.organizationSlug(organizationId);
    this.emit(organizationId, unpublishedEvent(saved, slug));
    return toEditorJson(saved);
  }

  async previewBlocks(
    organizationId: string,
    blocks: unknown,
  ): Promise<{ blocks: PublicBlock[] }> {
    const media = await this.media.indexFor(organizationId, collectMediaIds(blocks, []));
    return { blocks: toPublicBlocks(parseBlocks(blocks, media)) };
  }

  async getPublishedPosts(
    organizationId: string,
    query: FilterPublishedPostsDTO,
  ): Promise<PaginatedResponse<PublishedPostSummary>> {
    const where: Prisma.PostWhereInput = {
      organizationId,
      status: 'published',
      ...this.termFilter(query),
    };
    const [total, rows] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map((row) => this.toPublishedSummary(row)),
      meta: this.meta(total, query.page, query.limit),
    };
  }

  async getPublishedPost(organizationId: string, slug: string): Promise<PublicPost | null> {
    const row = await this.prisma.post.findFirst({
      where: { organizationId, slug, status: 'published' },
      include: POST_INCLUDE,
    });
    if (!row) return null;
    const doc = this.toDocument(row);
    if (doc.publication.status !== 'published') return null;
    return toPublicPost(doc);
  }

  /**
   * Tells the site about published posts that read differently because a
   * category or tag on them was renamed or deleted. Runs after the response,
   * like every other webhook.
   */
  announceUpdatedPosts(organizationId: string, postIds: readonly string[]): void {
    if (postIds.length === 0) return;
    void this.announce(organizationId, postIds).catch(() => {
      this.logger.error(`blog webhook post.updated for ${organizationId} failed`);
    });
  }

  private async announce(organizationId: string, postIds: readonly string[]): Promise<void> {
    const rows = await this.prisma.post.findMany({
      where: { organizationId, id: { in: [...postIds] }, status: 'published' },
      include: POST_INCLUDE,
    });
    if (rows.length === 0) return;
    const slug = await this.organizationSlug(organizationId);
    for (const row of rows) {
      this.emit(organizationId, updatedEvent(this.toDocument(row), slug));
    }
  }

  private async write(
    before: PostDocument,
    after: PostDocument,
    refs: PostRefs,
  ): Promise<PostDocument> {
    const row = await this.withFreeSlug(before.organizationId, after.slug, before.id, (slug) =>
      this.prisma.post.update({
        where: { id: before.id },
        data: {
          ...this.columns(after, slug),
          ...(refs.tags === undefined
            ? {}
            : {
                tags: {
                  deleteMany: {},
                  create: after.tags.map((tag) => ({ tagId: tag.id })),
                },
              }),
        },
        include: POST_INCLUDE,
      }),
    );
    return this.toDocument(row);
  }

  private withFreeSlug<T>(
    organizationId: string,
    wanted: Slug,
    postId: string | null,
    write: (slug: Slug) => Promise<T>,
  ): Promise<T> {
    return writeWithFreeSlug({
      wanted,
      constraint: POST_SLUG_CONSTRAINT,
      takenSlugs: async (stem) => {
        const rows = await this.prisma.post.findMany({
          where: {
            organizationId,
            slug: { startsWith: stem },
            ...(postId ? { id: { not: postId } } : {}),
          },
          select: { slug: true },
        });
        return rows.map((row) => row.slug);
      },
      write,
    });
  }

  private columns(doc: PostDocument, slug: Slug) {
    return {
      title: doc.title,
      slug,
      hasCustomSlug: doc.hasCustomSlug,
      excerpt: doc.excerpt,
      metaTitle: doc.metaTitle,
      metaDescription: doc.metaDescription,
      ogImageId: doc.ogImage?.id ?? null,
      coverImageId: doc.coverImage?.id ?? null,
      categoryId: doc.category?.id ?? null,
      blocks: doc.blocks,
    };
  }

  private termFilter(query: { category?: string; tag?: string }): Prisma.PostWhereInput {
    return {
      ...(query.category ? { category: { is: { slug: query.category } } } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag } } } } : {}),
    };
  }

  private async refsFor(organizationId: string, links: PostLinks): Promise<PostRefs> {
    const [media, category, tags] = await Promise.all([
      this.media.indexFor(
        organizationId,
        collectMediaIds(links.blocks, [links.ogImageId, links.coverImageId]),
      ),
      this.categoryFor(organizationId, links.categoryId),
      this.tagsFor(organizationId, links.tagIds),
    ]);
    return { media, category, tags };
  }

  private async categoryFor(
    organizationId: string,
    id: string | null | undefined,
  ): Promise<TermRef | null | undefined> {
    if (id === undefined || id === null) return id;
    const row = await this.prisma.category.findFirst({
      where: { id, organizationId },
      select: TERM_SELECT,
    });
    if (!row) throw new DraftRejected('Category was not found');
    return termRef(row);
  }

  private async tagsFor(
    organizationId: string,
    ids: string[] | undefined,
  ): Promise<TermRef[] | undefined> {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.tag.findMany({
      where: { organizationId, id: { in: unique } },
      select: TERM_SELECT,
    });
    if (rows.length !== unique.length) throw new DraftRejected('Tag was not found');
    return rows.map(termRef);
  }

  private findRow(organizationId: string, id: string): Promise<StoredPost | null> {
    return this.prisma.post.findFirst({
      where: { id, organizationId },
      include: POST_INCLUDE,
    });
  }

  private async organizationSlug(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    });
    if (!organization) throw new Error('Organization is missing');
    return organization.slug;
  }

  private toDocument(row: StoredPost): PostDocument {
    return {
      id: row.id as PostId,
      organizationId: row.organizationId as OrganizationId,
      title: row.title,
      slug: row.slug as Slug,
      hasCustomSlug: row.hasCustomSlug,
      excerpt: row.excerpt,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      ogImage: row.ogImage ? this.media.toRef(row.ogImage) : null,
      coverImage: row.coverImage ? this.media.toRef(row.coverImage) : null,
      category: row.category ? termRef(row.category) : null,
      tags: sortTerms(row.tags.map((link) => termRef(link.tag))),
      publication: publicationFromRow(row.status, row.publishedAt),
      blocks: readBlocks(row.blocks),
      updatedAt: row.updatedAt,
    };
  }

  private toSummaryJson(row: StoredSummary): PostSummaryJson {
    const publication = publicationFromRow(row.status, row.publishedAt);
    return {
      id: row.id as PostId,
      title: row.title,
      slug: row.slug as Slug,
      excerpt: row.excerpt,
      category: row.category ? termRef(row.category) : null,
      tags: sortTerms(row.tags.map((link) => termRef(link.tag))),
      status: publication.status,
      publishedAt:
        publication.status === 'published' ? publication.publishedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPublishedSummary(row: StoredSummary): PublishedPostSummary {
    const publication = publicationFromRow(row.status, row.publishedAt);
    if (publication.status !== 'published') {
      throw new Error('Stored publication is illegal');
    }
    return {
      title: row.title,
      slug: row.slug as Slug,
      excerpt: row.excerpt,
      publishedAt: publication.publishedAt.toISOString(),
      coverImage: row.coverImage
        ? { url: this.media.toRef(row.coverImage).url, alt: row.coverImage.alt }
        : null,
      category: row.category ? publicTerm(termRef(row.category)) : null,
      tags: sortTerms(row.tags.map((link) => termRef(link.tag))).map(publicTerm),
    };
  }

  private emit(organizationId: string, event: BlogWebhookEvent): void {
    void this.dispatch(organizationId, event).catch(() => {
      this.logger.error(
        `blog webhook ${event.type} for ${event.organizationSlug} failed`,
      );
    });
  }

  private async dispatch(organizationId: string, event: BlogWebhookEvent): Promise<void> {
    const access = await this.prisma.blogAccess.findUnique({
      where: { organizationId },
      select: { webhookUrl: true, webhookSecret: true },
    });
    if (!access?.webhookUrl || !access.webhookSecret) return;
    await this.webhooks.deliver(event, {
      url: access.webhookUrl,
      secret: access.webhookSecret,
    });
  }

  private meta(total: number, page: number, limit: number) {
    return {
      total,
      page,
      limit,
      lastPage: Math.max(Math.ceil(total / limit), 1),
    };
  }
}
