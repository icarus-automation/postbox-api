import { BadRequestException } from '@nestjs/common';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type ContentId = Brand<string, 'ContentId'>;
export type MediaId = Brand<string, 'MediaId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type Slug = Brand<string, 'Slug'>;
export type SanitizedHtml = Brand<string, 'SanitizedHtml'>;
export type HttpUrl = Brand<string, 'HttpUrl'>;
export type BlockId = Brand<string, 'BlockId'>;

export type EntryKind = 'post' | 'page';
export type ImageSide = 'image_left' | 'image_right';
export type HeadingLevel = 1 | 2 | 3;
export type ImageContentType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif';

export const ENTRY_KINDS = ['post', 'page'] as const satisfies readonly EntryKind[];
export const CONTENT_STATUSES = ['draft', 'published'] as const;
export const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const satisfies readonly ImageContentType[];
export const IMAGE_SIDES = ['image_left', 'image_right'] as const satisfies readonly ImageSide[];

export const MAX_IMAGE_BYTES = 5_000_000;

export type ProseMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'link'; href: HttpUrl };

export type ProseText = { type: 'text'; text: string; marks?: ProseMark[] };
export type ProseInline = ProseText | { type: 'hardBreak' };

export type ProseBlock =
  | { type: 'paragraph'; content?: ProseInline[] }
  | { type: 'blockquote'; content: ProseBlock[] }
  | { type: 'bulletList'; content: ProseListItem[] }
  | { type: 'orderedList'; content: ProseListItem[] };

export type ProseListItem = { type: 'listItem'; content: ProseBlock[] };
export type ProseDoc = { type: 'doc'; content: ProseBlock[] };

export type MediaRef = {
  id: MediaId;
  url: HttpUrl;
  alt: string;
  contentType: ImageContentType;
};

export type ImageSlot = { media: null } | { media: MediaRef };

export type PublicImage = {
  url: HttpUrl;
  alt: string;
  contentType: ImageContentType;
};

export type Block =
  | { id: BlockId; kind: 'rich_text'; doc: ProseDoc; html: SanitizedHtml }
  | { id: BlockId; kind: 'image'; image: ImageSlot }
  | {
      id: BlockId;
      kind: 'media_text';
      side: ImageSide;
      image: ImageSlot;
      heading: string | null;
      doc: ProseDoc;
      html: SanitizedHtml;
    }
  | { id: BlockId; kind: 'heading'; level: HeadingLevel; text: string }
  | { id: BlockId; kind: 'divider' };

export type Publication =
  | { status: 'draft' }
  | { status: 'published'; publishedAt: Date };

export type ContentDocument = {
  id: ContentId;
  organizationId: OrganizationId;
  kind: EntryKind;
  title: string;
  slug: Slug;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: MediaRef | null;
  coverImage: MediaRef | null;
  publication: Publication;
  blocks: Block[];
  updatedAt: Date;
};

export type DraftDocument = ContentDocument & { publication: { status: 'draft' } };

export type PublicBlock =
  | { kind: 'rich_text'; doc: ProseDoc; html: SanitizedHtml }
  | { kind: 'image'; image: PublicImage | null }
  | {
      kind: 'media_text';
      side: ImageSide;
      image: PublicImage | null;
      heading: string | null;
      doc: ProseDoc;
      html: SanitizedHtml;
    }
  | { kind: 'heading'; level: HeadingLevel; text: string }
  | { kind: 'divider' };

export type PublicEntry = {
  kind: EntryKind;
  title: string;
  slug: Slug;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: { url: HttpUrl; alt: string } | null;
  coverImage: { url: HttpUrl; alt: string } | null;
  publishedAt: string;
  blocks: PublicBlock[];
};

export type PublishedSummary = {
  kind: EntryKind;
  title: string;
  slug: Slug;
  excerpt: string;
  publishedAt: string;
  coverImage: { url: HttpUrl; alt: string } | null;
};

export type EditorEntryJson = {
  id: ContentId;
  kind: EntryKind;
  title: string;
  slug: Slug;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: MediaRef | null;
  coverImage: MediaRef | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
  blocks: Block[];
  updatedAt: string;
};

export type WebhookType = 'content.published' | 'content.unpublished' | 'content.updated';

export type WebhookEntry = Omit<PublicEntry, 'publishedAt'> & {
  status: 'draft' | 'published';
  publishedAt: string | null;
};

export type ContentWebhookEvent = {
  type: WebhookType;
  organizationSlug: string;
  entry: WebhookEntry;
};

export class DraftRejected extends BadRequestException {}
