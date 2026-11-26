import { randomBytes } from 'node:crypto';

import {
  DraftRejected,
  IMAGE_CONTENT_TYPES,
  type Block,
  type BlockId,
  type HeadingLevel,
  type ImageContentType,
  type ImageSide,
  type ImageSlot,
  type MediaId,
  type MediaRef,
  type PublicBlock,
  type PublicImage,
  type SanitizedHtml,
} from './blog.types';
import { baseHeadingAnchor, isHeadingAnchor } from './heading-anchor';
import { escapeText, parseProseDoc, renderProse, markdownToDoc } from './rich-text.codec';
import { sanitizeHtml } from './sanitize-html';

export type MediaIndex = ReadonlyMap<MediaId, MediaRef>;

const MAX_BLOCKS = 100;
const HEADING_TEXT_MAX = 200;

export type BlockKindRow<K extends Block['kind']> = {
  kind: K;
  parse(
    raw: unknown,
    media: MediaIndex,
    id: BlockId,
    previous?: readonly Block[],
  ): Extract<Block, { kind: K }>;
  fromStored(raw: unknown): Extract<Block, { kind: K }>;
  toPublic(block: Extract<Block, { kind: K }>): Extract<PublicBlock, { kind: K }>;
  // The block's markup, with the pb-* class names a site styles. renderBlocksHtml
  // sanitizes the whole post after joining these, so a row only has to escape its text.
  toHtml(block: Extract<PublicBlock, { kind: K }>): string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function uuidV7(): string {
  const bytes = randomBytes(16);
  const timestamp = Date.now();
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newBlockId(): BlockId {
  return uuidV7() as BlockId;
}

function requireMedia(id: string, media: MediaIndex): MediaRef {
  const ref = media.get(id as MediaId);
  if (!ref) throw new DraftRejected('Image was not found');
  return ref;
}

function imageSlot(raw: unknown, media: MediaIndex): ImageSlot {
  if (!isRecord(raw)) return { media: null };
  if ('mediaId' in raw) {
    if (raw.mediaId == null) return { media: null };
    if (typeof raw.mediaId !== 'string') throw new DraftRejected('Image media id is invalid');
    return { media: requireMedia(raw.mediaId, media) };
  }
  if (!isRecord(raw.image) || raw.image.media == null) return { media: null };
  if (!isRecord(raw.image.media) || typeof raw.image.media.id !== 'string') {
    throw new DraftRejected('Image media id is invalid');
  }
  return { media: requireMedia(raw.image.media.id, media) };
}

function publicImage(slot: ImageSlot): PublicImage | null {
  if (!slot.media) return null;
  return {
    url: slot.media.url,
    alt: slot.media.alt,
    contentType: slot.media.contentType,
  };
}

function proseFromWire(raw: Record<string, unknown>) {
  const hasMarkdown = raw.markdown !== undefined;
  const hasDoc = raw.doc !== undefined;
  if (hasMarkdown === hasDoc) {
    throw new DraftRejected('Rich text needs markdown or a doc, and not both');
  }
  if (hasMarkdown) {
    if (typeof raw.markdown !== 'string') throw new DraftRejected('Markdown is invalid');
    return parseProseDoc(markdownToDoc(raw.markdown));
  }
  return parseProseDoc(raw.doc);
}

function richTextFields(raw: Record<string, unknown>, id: BlockId) {
  const doc = proseFromWire(raw);
  return { id, kind: 'rich_text' as const, doc, html: sanitizeHtml(renderProse(doc)) };
}

function isImageContentType(value: unknown): value is ImageContentType {
  return (
    typeof value === 'string' &&
    (IMAGE_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

function storedMedia(raw: unknown): MediaRef | null {
  if (raw == null) return null;
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    typeof raw.url !== 'string' ||
    typeof raw.alt !== 'string' ||
    !isImageContentType(raw.contentType)
  ) {
    throw new Error('Stored image is invalid');
  }
  return raw as unknown as MediaRef;
}

function storedSlot(raw: unknown): ImageSlot {
  if (!isRecord(raw) || !('media' in raw)) throw new Error('Stored image is invalid');
  const media = storedMedia(raw.media);
  return media ? { media } : { media: null };
}

function storedHtml(raw: unknown): SanitizedHtml {
  if (typeof raw !== 'string') throw new Error('Stored html is invalid');
  return raw as SanitizedHtml;
}

function storedDoc(raw: unknown) {
  try {
    return parseProseDoc(raw);
  } catch (error) {
    if (error instanceof DraftRejected) {
      throw new Error('Stored rich text is invalid', { cause: error });
    }
    throw error;
  }
}

function headingText(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new DraftRejected('Heading is invalid');
  const text = raw.trim();
  if (text.length === 0) return null;
  if (text.length > HEADING_TEXT_MAX) throw new DraftRejected('Heading is too long');
  return text;
}

function sideOf(raw: unknown): ImageSide {
  if (raw === 'image_left' || raw === 'image_right') return raw;
  throw new DraftRejected('Image side is invalid');
}

function headingLevel(raw: unknown): HeadingLevel {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  throw new DraftRejected('Heading level is invalid');
}

function plainHeading(raw: unknown): string {
  if (typeof raw !== 'string') throw new DraftRejected('Heading is invalid');
  const text = raw.trim();
  if (text.length < 1 || text.length > HEADING_TEXT_MAX) {
    throw new DraftRejected('Heading is invalid');
  }
  return text;
}

function imageHtml(image: PublicImage): string {
  return `<img src="${escapeText(image.url)}" alt="${escapeText(image.alt)}" loading="lazy">`;
}

export const BLOCK_KINDS: { [K in Block['kind']]: BlockKindRow<K> } = {
  rich_text: {
    kind: 'rich_text',
    parse(raw, _media, id) {
      if (!isRecord(raw)) throw new DraftRejected('Rich text block is invalid');
      return richTextFields(raw, id);
    },
    fromStored(raw) {
      if (!isRecord(raw) || typeof raw.id !== 'string') throw new Error('Stored block is invalid');
      return {
        id: raw.id as BlockId,
        kind: 'rich_text',
        doc: storedDoc(raw.doc),
        html: storedHtml(raw.html),
      };
    },
    toPublic(block) {
      return { kind: 'rich_text', doc: block.doc, html: block.html };
    },
    toHtml(block) {
      return `<div class="pb-rich-text">${block.html}</div>`;
    },
  },
  image: {
    kind: 'image',
    parse(raw, media, id) {
      return { id, kind: 'image', image: imageSlot(raw, media) };
    },
    fromStored(raw) {
      if (!isRecord(raw) || typeof raw.id !== 'string') throw new Error('Stored block is invalid');
      return { id: raw.id as BlockId, kind: 'image', image: storedSlot(raw.image) };
    },
    toPublic(block) {
      return { kind: 'image', image: publicImage(block.image) };
    },
    toHtml(block) {
      // An empty slot has nothing to show, so it leaves no markup.
      return block.image ? `<figure class="pb-image">${imageHtml(block.image)}</figure>` : '';
    },
  },
  media_text: {
    kind: 'media_text',
    parse(raw, media, id) {
      if (!isRecord(raw)) throw new DraftRejected('Media and text block is invalid');
      const doc = proseFromWire(raw);
      return {
        id,
        kind: 'media_text',
        side: sideOf(raw.side),
        image: imageSlot(raw, media),
        heading: headingText(raw.heading),
        doc,
        html: sanitizeHtml(renderProse(doc)),
      };
    },
    fromStored(raw) {
      if (!isRecord(raw) || typeof raw.id !== 'string') throw new Error('Stored block is invalid');
      if (raw.side !== 'image_left' && raw.side !== 'image_right') {
        throw new Error('Stored block is invalid');
      }
      if (raw.heading !== null && typeof raw.heading !== 'string') {
        throw new Error('Stored block is invalid');
      }
      return {
        id: raw.id as BlockId,
        kind: 'media_text',
        side: raw.side,
        image: storedSlot(raw.image),
        heading: raw.heading,
        doc: storedDoc(raw.doc),
        html: storedHtml(raw.html),
      };
    },
    toPublic(block) {
      return {
        kind: 'media_text',
        side: block.side,
        image: publicImage(block.image),
        heading: block.heading,
        doc: block.doc,
        html: block.html,
      };
    },
    toHtml(block) {
      // Markup follows the page: the image comes first when it sits on the left, so
      // the layout holds even where the site styles nothing.
      const media = block.image
        ? `<figure class="pb-media-text__media">${imageHtml(block.image)}</figure>`
        : '';
      const heading = block.heading
        ? `<h2 class="pb-media-text__heading">${escapeText(block.heading)}</h2>`
        : '';
      const body = `<div class="pb-media-text__body">${heading}${block.html}</div>`;
      const side = block.side === 'image_left' ? 'image-left' : 'image-right';
      const parts = block.side === 'image_left' ? media + body : body + media;
      return `<div class="pb-media-text pb-media-text--${side}">${parts}</div>`;
    },
  },
  heading: {
    kind: 'heading',
    parse(raw, _media, id, previous) {
      if (!isRecord(raw)) throw new DraftRejected('Heading block is invalid');
      const text = plainHeading(raw.text);
      return {
        id,
        kind: 'heading',
        level: headingLevel(raw.level),
        text,
        anchor: headingAnchor(raw.anchor, text, id, previous),
      };
    },
    fromStored(raw) {
      if (
        !isRecord(raw) ||
        typeof raw.id !== 'string' ||
        (raw.level !== 1 && raw.level !== 2 && raw.level !== 3) ||
        typeof raw.text !== 'string'
      ) {
        throw new Error('Stored block is invalid');
      }
      const anchor =
        typeof raw.anchor === 'string' && isHeadingAnchor(raw.anchor)
          ? raw.anchor
          : baseHeadingAnchor(raw.text);
      return {
        id: raw.id as BlockId,
        kind: 'heading',
        level: raw.level,
        text: raw.text,
        anchor,
      };
    },
    toPublic(block) {
      return { kind: 'heading', level: block.level, text: block.text };
    },
    toHtml(block) {
      return `<h${block.level} class="pb-heading">${escapeText(block.text)}</h${block.level}>`;
    },
  },
  divider: {
    kind: 'divider',
    parse(_raw, _media, id) {
      return { id, kind: 'divider' };
    },
    fromStored(raw) {
      if (!isRecord(raw) || typeof raw.id !== 'string') throw new Error('Stored block is invalid');
      return { id: raw.id as BlockId, kind: 'divider' };
    },
    toPublic() {
      return { kind: 'divider' };
    },
    toHtml() {
      return '<hr class="pb-divider">';
    },
  },
};

function kindRow(kind: string): BlockKindRow<Block['kind']> | undefined {
  if (!Object.prototype.hasOwnProperty.call(BLOCK_KINDS, kind)) return undefined;
  return BLOCK_KINDS[kind as Block['kind']] as BlockKindRow<Block['kind']>;
}

function headingAnchor(
  raw: unknown,
  text: string,
  id: BlockId,
  previous: readonly Block[] | undefined,
): string {
  if (raw === undefined || raw === null || raw === '') {
    const prior = previous?.find((block) => block.id === id && block.kind === 'heading');
    if (prior && prior.kind === 'heading') return prior.anchor;
    return baseHeadingAnchor(text);
  }
  if (typeof raw !== 'string' || !isHeadingAnchor(raw)) {
    throw new DraftRejected('Heading anchor is invalid');
  }
  return raw;
}

function takeBlockId(raw: unknown, seen: Set<string>): BlockId {
  if (raw === undefined || raw === null) {
    const id = newBlockId();
    seen.add(id);
    return id;
  }
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 64) {
    throw new DraftRejected('Block id is invalid');
  }
  if (seen.has(raw)) throw new DraftRejected('Block ids must be unique');
  seen.add(raw);
  return raw as BlockId;
}

export function parseBlocks(
  raw: unknown,
  media: MediaIndex,
  previous?: readonly Block[],
): Block[] {
  if (!Array.isArray(raw)) throw new DraftRejected('Blocks must be an array');
  if (raw.length > MAX_BLOCKS) {
    throw new DraftRejected('A document can have at most 100 blocks');
  }
  const seen = new Set<string>();
  return raw.map((item) => {
    if (!isRecord(item) || typeof item.kind !== 'string') {
      throw new DraftRejected('Block is invalid');
    }
    const row = kindRow(item.kind);
    if (!row) throw new DraftRejected('Block kind is invalid');
    return row.parse(item, media, takeBlockId(item.id, seen), previous);
  });
}

export function readBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) throw new Error('Stored blocks are invalid');
  return raw.map((item) => {
    if (!isRecord(item) || typeof item.kind !== 'string') {
      throw new Error('Stored blocks are invalid');
    }
    const row = kindRow(item.kind);
    if (!row) throw new Error('Stored blocks are invalid');
    return row.fromStored(item);
  });
}

export function toPublicBlocks(blocks: Block[]): PublicBlock[] {
  return blocks.map((block) => {
    const row = BLOCK_KINDS[block.kind] as BlockKindRow<typeof block.kind>;
    return row.toPublic(block);
  });
}

export function collectMediaIds(
  blocks: unknown,
  extras: Array<string | null | undefined>,
): string[] {
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  };
  for (const extra of extras) add(extra);
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isRecord(value)) return;
    add(value.mediaId);
    if (isRecord(value.media)) add(value.media.id);
    for (const child of Object.values(value)) walk(child);
  };
  walk(blocks);
  return [...ids];
}
