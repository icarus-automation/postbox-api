import {
  DraftRejected,
  type BlockId,
  type BlogWebhookEvent,
  type EditorPostJson,
  type MediaId,
  type OrganizationId,
  type PostDocument,
  type PostId,
  type PublicPost,
  type PublicTerm,
  type Publication,
  type Slug,
  type TermRef,
  type WebhookPost,
} from './blog.types';
import {
  BLOCK_KINDS,
  parseBlocks,
  renderBlocksHtml,
  toPublicBlocks,
  uuidV7,
  type MediaIndex,
} from './block-registry';
import { EMPTY_DOC } from './rich-text.codec';
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from './slugs';

export type { MediaIndex } from './block-registry';

// The slug of a post whose title has no letter or digit to make one from.
const FALLBACK_SLUG = 'post' as Slug;

export type PostFields = {
  title?: string;
  // A string is a slug a person chose. null hands the slug back to the title.
  slug?: string | null;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImageId?: string | null;
  coverImageId?: string | null;
  blocks?: unknown;
};

// What a write points at, read before the document changes. A category or tags
// left undefined stay as the post has them.
export type PostRefs = {
  media: MediaIndex;
  category?: TermRef | null;
  tags?: TermRef[];
};

function text(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new DraftRejected(`${label} is invalid`);
  }
  return trimmed;
}

function chosenSlug(value: string): Slug {
  const slug = value.trim();
  if (!SLUG_PATTERN.test(slug) || slug.length > SLUG_MAX_LENGTH) {
    throw new DraftRejected('Slug is invalid');
  }
  return slug as Slug;
}

function optionalText(value: string, max: number, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new DraftRejected(`${label} is too long`);
  return trimmed;
}

function slugFromTitle(title: string): Slug {
  return (slugify(title) || FALLBACK_SLUG) as Slug;
}

// The slug a write asks for, before it is made unique. A draft whose slug no
// person chose follows its title. A published post keeps its slug until a
// person changes it.
function wantedSlug(
  doc: PostDocument,
  title: string,
  slug: string | null | undefined,
): { slug: Slug; hasCustomSlug: boolean } {
  if (typeof slug === 'string') return { slug: chosenSlug(slug), hasCustomSlug: true };
  const hasCustomSlug = slug === null ? false : doc.hasCustomSlug;
  if (!hasCustomSlug && doc.publication.status === 'draft') {
    return { slug: slugFromTitle(title), hasCustomSlug };
  }
  return { slug: doc.slug, hasCustomSlug };
}

export function sortTerms(terms: TermRef[]): TermRef[] {
  return [...terms].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/** A post that does not exist yet. Blocks start as one empty text block. */
export function blankDraft(organizationId: OrganizationId): PostDocument {
  return {
    id: '' as PostId,
    organizationId,
    title: '',
    slug: FALLBACK_SLUG,
    hasCustomSlug: false,
    excerpt: '',
    metaTitle: '',
    metaDescription: '',
    ogImage: null,
    coverImage: null,
    category: null,
    tags: [],
    publication: { status: 'draft' },
    blocks: [BLOCK_KINDS.rich_text.parse({ doc: EMPTY_DOC }, new Map(), uuidV7() as BlockId)],
    updatedAt: new Date(),
  };
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

function linkedImage(
  current: PostDocument['ogImage'],
  next: string | null | undefined,
  media: MediaIndex,
): PostDocument['ogImage'] {
  if (next === undefined) return current;
  if (next === null) return null;
  const ref = media.get(next as MediaId);
  if (!ref) throw new DraftRejected('Image was not found');
  return ref;
}

/** The document after a write. Its slug may still be taken, which the caller settles. */
export function applyFields(
  doc: PostDocument,
  fields: PostFields,
  refs: PostRefs,
): PostDocument {
  const title = fields.title === undefined ? doc.title : text(fields.title, 'Title', 200);
  const { slug, hasCustomSlug } = wantedSlug(doc, title, fields.slug);
  return {
    ...doc,
    title,
    slug,
    hasCustomSlug,
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
    ogImage: linkedImage(doc.ogImage, fields.ogImageId, refs.media),
    coverImage: linkedImage(doc.coverImage, fields.coverImageId, refs.media),
    category: refs.category === undefined ? doc.category : refs.category,
    tags: refs.tags === undefined ? doc.tags : sortTerms(refs.tags),
    blocks: fields.blocks === undefined ? doc.blocks : parseBlocks(fields.blocks, refs.media),
  };
}

export function publicTerm(term: TermRef): PublicTerm {
  return { name: term.name, slug: term.slug };
}

// Everything a site reads except the rendered html, which is made from the blocks.
function toPublicFields(doc: PostDocument): Omit<WebhookPost, 'html'> {
  const publishedAt =
    doc.publication.status === 'published'
      ? doc.publication.publishedAt.toISOString()
      : null;
  return {
    status: doc.publication.status,
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    ogImage: doc.ogImage ? { url: doc.ogImage.url, alt: doc.ogImage.alt } : null,
    coverImage: doc.coverImage
      ? { url: doc.coverImage.url, alt: doc.coverImage.alt }
      : null,
    category: doc.category ? publicTerm(doc.category) : null,
    tags: doc.tags.map(publicTerm),
    publishedAt,
    blocks: toPublicBlocks(doc.blocks),
  };
}

function toWebhookPost(doc: PostDocument): WebhookPost {
  const post = toPublicFields(doc);
  return { ...post, html: renderBlocksHtml(post.blocks) };
}

// The html is left out: it follows from the blocks, so comparing them is enough.
function canonicalPublic(doc: PostDocument): string {
  const post = toPublicFields(doc);
  return JSON.stringify({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    ogImage: post.ogImage,
    coverImage: post.coverImage,
    category: post.category,
    tags: post.tags,
    blocks: post.blocks,
  });
}

/** True when a published post reads differently on the site after a write. */
export function changedInPublic(before: PostDocument, after: PostDocument): boolean {
  return (
    before.publication.status === 'published' &&
    after.publication.status === 'published' &&
    canonicalPublic(before) !== canonicalPublic(after)
  );
}

export function publishedEvent(doc: PostDocument, organizationSlug: string): BlogWebhookEvent {
  return { type: 'post.published', organizationSlug, post: toWebhookPost(doc) };
}

export function unpublishedEvent(doc: PostDocument, organizationSlug: string): BlogWebhookEvent {
  return { type: 'post.unpublished', organizationSlug, post: toWebhookPost(doc) };
}

export function updatedEvent(doc: PostDocument, organizationSlug: string): BlogWebhookEvent {
  return { type: 'post.updated', organizationSlug, post: toWebhookPost(doc) };
}

export function toPublicPost(doc: PostDocument): PublicPost {
  if (doc.publication.status !== 'published') {
    throw new Error('A draft has no public post');
  }
  const post = toWebhookPost(doc);
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    ogImage: post.ogImage,
    coverImage: post.coverImage,
    category: post.category,
    tags: post.tags,
    publishedAt: doc.publication.publishedAt.toISOString(),
    blocks: post.blocks,
    html: post.html,
  };
}

export function toEditorJson(doc: PostDocument): EditorPostJson {
  return {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    hasCustomSlug: doc.hasCustomSlug,
    excerpt: doc.excerpt,
    metaTitle: doc.metaTitle,
    metaDescription: doc.metaDescription,
    ogImage: doc.ogImage,
    coverImage: doc.coverImage,
    category: doc.category,
    tags: doc.tags,
    status: doc.publication.status,
    publishedAt:
      doc.publication.status === 'published'
        ? doc.publication.publishedAt.toISOString()
        : null,
    blocks: doc.blocks,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
