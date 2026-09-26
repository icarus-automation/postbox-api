import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { PaginatedResponse } from '../../common/responses/paginated-api.response';
import {
  isUniqueConstraintViolation,
  type UniqueConstraint,
} from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import { ContentMediaService } from './content-media.service';
import { ContentWebhook } from './content-webhook.service';
import { collectMediaIds, parseBlocks, readBlocks, toPublicBlocks } from './document/block-registry';
import {
  applyDraftPatch,
  applyEditorSave,
  publicationFromRow,
  publishDocument,
  templateBlocks,
  toEditorJson,
  toPublicEntry,
  toWebhookEntry,
  unpublishDocument,
} from './document/content-document';
import {
  type ContentDocument,
  type ContentId,
  type ContentWebhookEvent,
  type DraftDocument,
  type EditorEntryJson,
  type OrganizationId,
  type PublicBlock,
  type PublicEntry,
  type PublishedSummary,
  type Slug,
} from './document/content.types';
import type { CreateContentDTO } from './dto/create-content.dto';
import type { FilterContentDTO } from './dto/filter-content.dto';
import type { FilterPublishedDTO } from './dto/filter-published.dto';
import type { SaveContentDTO } from './dto/save-content.dto';
import type { UpdateDraftDTO } from './dto/update-draft.dto';

const ENTRY_SLUG_CONSTRAINT: UniqueConstraint = {
  index: 'content_entries_organization_id_slug_key',
  fields: ['organization_id', 'slug'],
};

const ENTRY_INCLUDE = {
  ogImage: true,
  coverImage: true,
} satisfies Prisma.ContentEntryInclude;

type StoredEntry = Prisma.ContentEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

@Injectable()
export class ContentEntriesService {
  private readonly logger = new Logger(ContentEntriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ContentMediaService,
    private readonly webhooks: ContentWebhook,
  ) {}

  async list(
    organizationId: string,
    query: FilterContentDTO,
  ): Promise<PaginatedResponse<EditorEntryJson>> {
    const where: Prisma.ContentEntryWhereInput = {
      organizationId,
      kind: query.kind,
      status: query.status,
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentEntry.count({ where }),
      this.prisma.contentEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map((row) => toEditorJson(this.toDocument(row))),
      meta: this.meta(total, query.page, query.limit),
    };
  }

  async get(organizationId: string, id: string): Promise<EditorEntryJson | null> {
    const row = await this.findRow(organizationId, id);
    return row ? toEditorJson(this.toDocument(row)) : null;
  }

  async createDraft(
    organizationId: string,
    body: CreateContentDTO,
  ): Promise<EditorEntryJson> {
    const media = await this.media.indexFor(
      organizationId,
      collectMediaIds(body.blocks, [body.ogImageId, body.coverImageId]),
    );
    const blocks =
      body.blocks === undefined
        ? templateBlocks(body.kind)
        : parseBlocks(body.blocks, media);
    try {
      const row = await this.prisma.contentEntry.create({
        data: {
          organizationId,
          kind: body.kind,
          title: body.title.trim(),
          slug: body.slug.trim(),
          excerpt: body.excerpt?.trim() ?? '',
          metaTitle: body.metaTitle?.trim() ?? '',
          metaDescription: body.metaDescription?.trim() ?? '',
          ogImageId: body.ogImageId ?? null,
          coverImageId: body.coverImageId ?? null,
          status: 'draft',
          publishedAt: null,
          blocks,
        },
        include: ENTRY_INCLUDE,
      });
      return toEditorJson(this.toDocument(row));
    } catch (error) {
      if (isUniqueConstraintViolation(error, ENTRY_SLUG_CONSTRAINT)) {
        throw new ConflictException('Slug already exists');
      }
      throw error;
    }
  }

  async updateDraft(
    organizationId: string,
    id: string,
    body: UpdateDraftDTO,
  ): Promise<EditorEntryJson | 'published' | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const doc = this.toDocument(row);
    if (doc.publication.status !== 'draft') return 'published';
    const next = applyDraftPatch(
      doc as DraftDocument,
      body,
      await this.mediaFor(organizationId, body.blocks, [body.ogImageId, body.coverImageId]),
    );
    return this.writeFields(row.id, next);
  }

  async saveFromEditor(
    organizationId: string,
    id: string,
    body: SaveContentDTO,
  ): Promise<EditorEntryJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const doc = this.toDocument(row);
    const { doc: next, event } = applyEditorSave(
      doc,
      body,
      await this.mediaFor(organizationId, body.blocks, [body.ogImageId, body.coverImageId]),
    );
    const saved = await this.writeFields(row.id, next);
    if (event) {
      const slug = await this.organizationSlug(organizationId);
      this.emit(organizationId, {
        type: event,
        organizationSlug: slug,
        entry: toWebhookEntry(next),
      });
    }
    return saved;
  }

  async publish(
    organizationId: string,
    id: string,
    now: Date,
  ): Promise<EditorEntryJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const doc = this.toDocument(row);
    if (doc.publication.status === 'published') return toEditorJson(doc);
    const slug = await this.organizationSlug(organizationId);
    const { event } = publishDocument(doc, now, slug);
    if (!event) return toEditorJson(doc);
    const saved = await this.prisma.contentEntry.update({
      where: { id: row.id },
      data: { status: 'published', publishedAt: now },
      include: ENTRY_INCLUDE,
    });
    this.emit(organizationId, event);
    return toEditorJson(this.toDocument(saved));
  }

  async unpublish(organizationId: string, id: string): Promise<EditorEntryJson | null> {
    const row = await this.findRow(organizationId, id);
    if (!row) return null;
    const doc = this.toDocument(row);
    if (doc.publication.status === 'draft') return toEditorJson(doc);
    const slug = await this.organizationSlug(organizationId);
    const { event } = unpublishDocument(doc, slug);
    if (!event) return toEditorJson(doc);
    const saved = await this.prisma.contentEntry.update({
      where: { id: row.id },
      data: { status: 'draft', publishedAt: null },
      include: ENTRY_INCLUDE,
    });
    this.emit(organizationId, event);
    return toEditorJson(this.toDocument(saved));
  }

  async preview(organizationId: string, blocks: unknown): Promise<{ blocks: PublicBlock[] }> {
    const media = await this.mediaFor(organizationId, blocks, []);
    return { blocks: toPublicBlocks(parseBlocks(blocks, media)) };
  }

  async listPublished(
    organizationId: string,
    query: FilterPublishedDTO,
  ): Promise<PaginatedResponse<PublishedSummary>> {
    const where: Prisma.ContentEntryWhereInput = {
      organizationId,
      status: 'published',
      kind: query.kind,
    };
    const [total, rows] = await Promise.all([
      this.prisma.contentEntry.count({ where }),
      this.prisma.contentEntry.findMany({
        where,
        include: { coverImage: true },
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map((row) => {
        const publication = publicationFromRow(row.status, row.publishedAt);
        if (publication.status !== 'published') {
          throw new Error('Stored publication is illegal');
        }
        return {
          kind: row.kind,
          title: row.title,
          slug: row.slug as Slug,
          excerpt: row.excerpt,
          publishedAt: publication.publishedAt.toISOString(),
          coverImage: row.coverImage
            ? {
                url: this.media.toRef(row.coverImage).url,
                alt: row.coverImage.alt,
              }
            : null,
        };
      }),
      meta: this.meta(total, query.page, query.limit),
    };
  }

  async getPublishedBySlug(
    organizationId: string,
    slug: string,
  ): Promise<PublicEntry | null> {
    const row = await this.prisma.contentEntry.findFirst({
      where: { organizationId, slug, status: 'published' },
      include: ENTRY_INCLUDE,
    });
    if (!row) return null;
    const doc = this.toDocument(row);
    if (doc.publication.status !== 'published') return null;
    return toPublicEntry(doc);
  }

  private async writeFields(id: string, doc: ContentDocument): Promise<EditorEntryJson> {
    try {
      const saved = await this.prisma.contentEntry.update({
        where: { id },
        data: {
          title: doc.title,
          slug: doc.slug,
          excerpt: doc.excerpt,
          metaTitle: doc.metaTitle,
          metaDescription: doc.metaDescription,
          ogImageId: doc.ogImage?.id ?? null,
          coverImageId: doc.coverImage?.id ?? null,
          blocks: doc.blocks,
        },
        include: ENTRY_INCLUDE,
      });
      return toEditorJson(this.toDocument(saved));
    } catch (error) {
      if (isUniqueConstraintViolation(error, ENTRY_SLUG_CONSTRAINT)) {
        throw new ConflictException('Slug already exists');
      }
      throw error;
    }
  }

  private findRow(organizationId: string, id: string): Promise<StoredEntry | null> {
    return this.prisma.contentEntry.findFirst({
      where: { id, organizationId },
      include: ENTRY_INCLUDE,
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

  private mediaFor(
    organizationId: string,
    blocks: unknown,
    extras: Array<string | null | undefined>,
  ) {
    return this.media.indexFor(organizationId, collectMediaIds(blocks, extras));
  }

  private toDocument(row: StoredEntry): ContentDocument {
    return {
      id: row.id as ContentId,
      organizationId: row.organizationId as OrganizationId,
      kind: row.kind,
      title: row.title,
      slug: row.slug as Slug,
      excerpt: row.excerpt,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      ogImage: row.ogImage ? this.media.toRef(row.ogImage) : null,
      coverImage: row.coverImage ? this.media.toRef(row.coverImage) : null,
      publication: publicationFromRow(row.status, row.publishedAt),
      blocks: readBlocks(row.blocks),
      updatedAt: row.updatedAt,
    };
  }

  private emit(organizationId: string, event: ContentWebhookEvent | null): void {
    if (!event) return;
    void this.dispatch(organizationId, event).catch(() => {
      this.logger.error(
        `content webhook ${event.type} for ${event.organizationSlug} failed`,
      );
    });
  }

  private async dispatch(
    organizationId: string,
    event: ContentWebhookEvent,
  ): Promise<void> {
    const access = await this.prisma.contentAccess.findUnique({
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
