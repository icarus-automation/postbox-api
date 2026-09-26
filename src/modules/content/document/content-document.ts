import {
  DraftRejected,
  type BlockId,
  type ContentDocument,
  type ContentWebhookEvent,
  type DraftDocument,
  type EditorEntryJson,
  type EntryKind,
  type MediaId,
  type PublicEntry,
  type Publication,
  type Slug,
  type WebhookEntry,
  type WebhookType,
} from './content.types';
import {
  BLOCK_KINDS,
  parseBlocks,
  toPublicBlocks,
  uuidV7,
  type MediaIndex,
} from './block-registry';
import { EMPTY_DOC } from './rich-text.codec';

export type { MediaIndex } from './block-registry';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Describe this section.' }],
    },
  ],
};

export type ContentFields = {
  title?: string;
  slug?: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImageId?: string | null;
  coverImageId?: string | null;
  blocks?: unknown;
};

function text(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new DraftRejected(`${label} is invalid`);
  }
  return trimmed;
}

function slugOf(value: string): Slug {
  const slug = value.trim();
  if (!SLUG.test(slug) || slug.length > 200) throw new DraftRejected('Slug is invalid');
  return slug as Slug;
}

function optionalText(value: string, max: number, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new DraftRejected(`${label} is too long`);
  return trimmed;
}

export function templateBlocks(kind: EntryKind) {
  const media = new Map();
  if (kind === 'post') {
    return [BLOCK_KINDS.rich_text.parse({ doc: EMPTY_DOC }, media, uuidV7() as BlockId)];
  }
  const heading = BLOCK_KINDS.heading.parse(
    { level: 2, text: 'Section' },
    media,
    uuidV7() as BlockId,
  );
  const sides = ['image_left', 'image_right', 'image_left'] as const;
  const sections = sides.map((side) =>
    BLOCK_KINDS.media_text.parse(
      { side, heading: null, doc: SECTION_DOC },
      media,
      uuidV7() as BlockId,
    ),
  );
  return [heading, ...sections];
}

export function publicationFromRow(
  status: 'draft' | 'published',
  publishedAt: Date | null,
): Publication {
  if (status === 'draft' && publishedAt === null) return { status: 'draft' };
  if (status === 'published' && publishedAt instanceof Date && !Number.isNaN(publishedAt.getTime())) {
    return { status: 'published', publishedAt };
  }
  throw new Error('Stored publication is illegal');
}

export function toColumns(publication: Publication): {
  status: 'draft' | 'published';
  publishedAt: Date | null;
} {
  if (publication.status === 'published') {
    return { status: 'published', publishedAt: publication.publishedAt };
  }
  return { status: 'draft', publishedAt: null };
}

function linkedImage(
  current: ContentDocument['ogImage'],
  next: string | null | undefined,
  media: MediaIndex,
): ContentDocument['ogImage'] {
  if (next === undefined) return current;
  if (next === null) return null;
  const ref = media.get(next as MediaId);
  if (!ref) throw new DraftRejected('Image was not found');
  return ref;
}

function applyFields(
  doc: ContentDocument,
  fields: ContentFields,
  media: MediaIndex,
): ContentDocument {
  const blocks =
    fields.blocks === undefined ? doc.blocks : parseBlocks(fields.blocks, media);
  return {
    ...doc,
    title: fields.title === undefined ? doc.title : text(fields.title, 'Title', 200),
    slug: fields.slug === undefined ? doc.slug : slugOf(fields.slug),
    excerpt:
      fields.excerpt === undefined
        ? doc.excerpt
        : optionalText(fields.excerpt, 500, 'Excerpt'),
    metaTitle:
      fields.metaTitle === undefined
        ? doc.metaTitle
        : optionalText(fields.metaTitle, 200, 'Meta title'),
    metaDescription:
      fields.metaDescription === undefined
        ? doc.metaDescription
        : optionalText(fields.metaDescription, 500, 'Meta description'),
    ogImage: linkedImage(doc.ogImage, fields.ogImageId, media),
    coverImage: linkedImage(doc.coverImage, fields.coverImageId, media),
    blocks,
  };
}

export function toWebhookEntry(doc: ContentDocument): WebhookEntry {
  const publishedAt =
    doc.publication.status === 'published'
      ? doc.publication.publishedAt.toISOString()
      : null;
  return {
    status: doc.publication.status,
    kind: doc.kind,
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    ogImage: doc.ogImage ? { url: doc.ogImage.url, alt: doc.ogImage.alt } : null,
    coverImage: doc.coverImage
      ? { url: doc.coverImage.url, alt: doc.coverImage.alt }
      : null,
    publishedAt,
    blocks: toPublicBlocks(doc.blocks),
  };
}

function canonicalPublic(doc: ContentDocument): string {
  const entry = toWebhookEntry(doc);
  return JSON.stringify({
    kind: entry.kind,
    title: entry.title,
    slug: entry.slug,
    excerpt: entry.excerpt,
    metaTitle: entry.metaTitle,
    metaDescription: entry.metaDescription,
    ogImage: entry.ogImage,
    coverImage: entry.coverImage,
    blocks: entry.blocks,
  });
}

export function publishDocument(
  doc: ContentDocument,
  now: Date,
  organizationSlug: string,
): { doc: ContentDocument; event: ContentWebhookEvent | null } {
  if (doc.publication.status === 'published') return { doc, event: null };
  const next: ContentDocument = {
    ...doc,
    publication: { status: 'published', publishedAt: now },
  };
  return {
    doc: next,
    event: {
      type: 'content.published',
      organizationSlug,
      entry: toWebhookEntry(next),
    },
  };
}

export function unpublishDocument(
  doc: ContentDocument,
  organizationSlug: string,
): { doc: ContentDocument; event: ContentWebhookEvent | null } {
  if (doc.publication.status === 'draft') return { doc, event: null };
  const next: ContentDocument = { ...doc, publication: { status: 'draft' } };
  return {
    doc: next,
    event: {
      type: 'content.unpublished',
      organizationSlug,
      entry: toWebhookEntry(next),
    },
  };
}

export function applyEditorSave(
  doc: ContentDocument,
  save: ContentFields & { title: string; slug: string; blocks: unknown },
  media: MediaIndex,
): { doc: ContentDocument; event: WebhookType | null } {
  const next = applyFields(doc, save, media);
  const changed =
    doc.publication.status === 'published' &&
    canonicalPublic(doc) !== canonicalPublic(next);
  return { doc: next, event: changed ? 'content.updated' : null };
}

export function applyDraftPatch(
  doc: DraftDocument,
  patch: ContentFields,
  media: MediaIndex,
): DraftDocument {
  const next = applyFields(doc, patch, media);
  return next as DraftDocument;
}

export function toPublicEntry(doc: ContentDocument): PublicEntry {
  if (doc.publication.status !== 'published') {
    throw new Error('A draft has no public entry');
  }
  const entry = toWebhookEntry(doc);
  return {
    kind: entry.kind,
    title: entry.title,
    slug: entry.slug,
    excerpt: entry.excerpt,
    metaTitle: entry.metaTitle,
    metaDescription: entry.metaDescription,
    ogImage: entry.ogImage,
    coverImage: entry.coverImage,
    publishedAt: doc.publication.publishedAt.toISOString(),
    blocks: entry.blocks,
  };
}

export function toEditorJson(doc: ContentDocument): EditorEntryJson {
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    ogImage: doc.ogImage,
    coverImage: doc.coverImage,
    status: doc.publication.status,
    publishedAt:
      doc.publication.status === 'published'
        ? doc.publication.publishedAt.toISOString()
        : null,
    blocks: doc.blocks,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
