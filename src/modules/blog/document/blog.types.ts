import { BadRequestException } from '@nestjs/common';

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type PostId = Brand<string, 'PostId'>;
export type MediaId = Brand<string, 'MediaId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type Slug = Brand<string, 'Slug'>;
export type SanitizedHtml = Brand<string, 'SanitizedHtml'>;
export type HttpUrl = Brand<string, 'HttpUrl'>;
export type BlockId = Brand<string, 'BlockId'>;

export type PostStatus = 'draft' | 'published';
export type ImageSide = 'image_left' | 'image_right';
export type HeadingLevel = 1 | 2 | 3;
export type ImageContentType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif';

export const POST_STATUSES = ['draft', 'published'] as const satisfies readonly PostStatus[];
export const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const satisfies readonly ImageContentType[];
export const IMAGE_SIDES = ['image_left', 'image_right'] as const satisfies readonly ImageSide[];

export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_TAGS_PER_POST = 50;

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

/** A category or a tag, as a post carries it. */
export type TermRef = { id: string; name: string; slug: Slug };

export type PostDocument = {
  id: PostId;
  organizationId: OrganizationId;
  title: string;
  slug: Slug;
  hasCustomSlug: boolean;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: MediaRef | null;
  coverImage: MediaRef | null;
  category: TermRef | null;
  tags: TermRef[];
  publication: Publication;
  blocks: Block[];
  updatedAt: Date;
};

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

export type PublicTerm = { name: string; slug: Slug };

export type PublicPost = {
  title: string;
  slug: Slug;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: { url: HttpUrl; alt: string } | null;
  coverImage: { url: HttpUrl; alt: string } | null;
  category: PublicTerm | null;
  tags: PublicTerm[];
  publishedAt: string;
  blocks: PublicBlock[];
};

export type PublishedPostSummary = {
  title: string;
  slug: Slug;
  excerpt: string;
  publishedAt: string;
  coverImage: { url: HttpUrl; alt: string } | null;
  category: PublicTerm | null;
  tags: PublicTerm[];
};

/** A category or a tag in the public lists, counting published posts only. */
export type PublishedTerm = PublicTerm & { postCount: number };

export type EditorPostJson = {
  id: PostId;
  title: string;
  slug: Slug;
  hasCustomSlug: boolean;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: MediaRef | null;
  coverImage: MediaRef | null;
  category: TermRef | null;
  tags: TermRef[];
  status: PostStatus;
  publishedAt: string | null;
  blocks: Block[];
  updatedAt: string;
};

/** A row of the post list: everything but the body. */
export type PostSummaryJson = Omit<
  EditorPostJson,
  'hasCustomSlug' | 'metaTitle' | 'metaDescription' | 'ogImage' | 'coverImage' | 'blocks'
>;

/** A category or a tag in the organization's own lists, counting drafts too. */
export type TermJson = TermRef & { postCount: number };

export type WebhookType = 'post.published' | 'post.unpublished' | 'post.updated';

export type WebhookPost = Omit<PublicPost, 'publishedAt'> & {
  status: PostStatus;
  publishedAt: string | null;
};

export type BlogWebhookEvent = {
  type: WebhookType;
  organizationSlug: string;
  post: WebhookPost;
};

export class DraftRejected extends BadRequestException {}
