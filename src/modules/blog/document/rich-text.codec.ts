import Blockquote from '@tiptap/extension-blockquote';
import Bold from '@tiptap/extension-bold';
import BulletList from '@tiptap/extension-bullet-list';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Heading from '@tiptap/extension-heading';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { MarkdownManager } from '@tiptap/markdown';

import {
  DraftRejected,
  type HeadingLevel,
  type HttpUrl,
  type ProseBlock,
  type ProseDoc,
  type ProseInline,
  type ProseMark,
} from './blog.types';

export const EMPTY_DOC: ProseDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const RICH_TEXT_EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Link.configure({
    openOnClick: false,
    autolink: false,
    protocols: ['http', 'https'],
  }),
  BulletList,
  OrderedList,
  ListItem,
  HardBreak,
  Blockquote,
  Heading.configure({ levels: [1, 2, 3] }),
];

const markdown = new MarkdownManager({ extensions: RICH_TEXT_EXTENSIONS });

export function markdownToDoc(source: string): unknown {
  try {
    return markdown.parse(source);
  } catch {
    throw new DraftRejected('Markdown could not be read');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function httpUrl(value: unknown): HttpUrl {
  if (typeof value !== 'string') throw new DraftRejected('Link href is invalid');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DraftRejected('Link href is invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new DraftRejected('Link href must be http or https');
  }
  return value as HttpUrl;
}

function parseMark(raw: unknown): ProseMark {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new DraftRejected('Rich text mark is invalid');
  }
  if (raw.type === 'bold') return { type: 'bold' };
  if (raw.type === 'italic') return { type: 'italic' };
  if (raw.type === 'link') {
    const attrs = isRecord(raw.attrs) ? raw.attrs : raw;
    return { type: 'link', href: httpUrl(attrs.href) };
  }
  throw new DraftRejected('Rich text mark is invalid');
}

function parseInline(raw: unknown): ProseInline {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new DraftRejected('Rich text is invalid');
  }
  if (raw.type === 'hardBreak') return { type: 'hardBreak' };
  if (raw.type !== 'text' || typeof raw.text !== 'string') {
    throw new DraftRejected('Rich text is invalid');
  }
  if (raw.marks === undefined) return { type: 'text', text: raw.text };
  if (!Array.isArray(raw.marks)) throw new DraftRejected('Rich text is invalid');
  return { type: 'text', text: raw.text, marks: raw.marks.map(parseMark) };
}

function parseBlock(raw: unknown): ProseBlock {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new DraftRejected('Rich text is invalid');
  }
  if (raw.type === 'paragraph') {
    if (raw.content === undefined) return { type: 'paragraph' };
    if (!Array.isArray(raw.content)) throw new DraftRejected('Rich text is invalid');
    return { type: 'paragraph', content: raw.content.map(parseInline) };
  }
  if (raw.type === 'heading') {
    const attrs = isRecord(raw.attrs) ? raw.attrs : {};
    const level = attrs.level ?? raw.level;
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new DraftRejected('Rich text is invalid');
    }
    if (raw.content === undefined) return { type: 'heading', level };
    if (!Array.isArray(raw.content)) throw new DraftRejected('Rich text is invalid');
    return { type: 'heading', level, content: raw.content.map(parseInline) };
  }
  if (raw.type === 'blockquote') {
    if (!Array.isArray(raw.content)) throw new DraftRejected('Rich text is invalid');
    return { type: 'blockquote', content: raw.content.map(parseBlock) };
  }
  if (raw.type === 'bulletList' || raw.type === 'orderedList') {
    if (!Array.isArray(raw.content)) throw new DraftRejected('Rich text is invalid');
    return {
      type: raw.type,
      content: raw.content.map((item) => {
        if (!isRecord(item) || item.type !== 'listItem' || !Array.isArray(item.content)) {
          throw new DraftRejected('Rich text is invalid');
        }
        return { type: 'listItem' as const, content: item.content.map(parseBlock) };
      }),
    };
  }
  throw new DraftRejected('Rich text is invalid');
}

export function parseProseDoc(raw: unknown): ProseDoc {
  if (!isRecord(raw) || raw.type !== 'doc' || !Array.isArray(raw.content)) {
    throw new DraftRejected('Rich text is invalid');
  }
  return { type: 'doc', content: raw.content.map(parseBlock) };
}

export function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(inline: ProseInline): string {
  if (inline.type === 'hardBreak') return '<br>';
  let html = escapeText(inline.text);
  for (const mark of [...(inline.marks ?? [])].reverse()) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'italic') html = `<em>${html}</em>`;
    else html = `<a href="${escapeText(mark.href)}">${html}</a>`;
  }
  return html;
}

type HeadingId = (level: HeadingLevel, plain: string) => string;

function renderBlock(block: ProseBlock, headingId?: HeadingId): string {
  if (block.type === 'paragraph') {
    return `<p>${(block.content ?? []).map(renderInline).join('')}</p>`;
  }
  if (block.type === 'heading') {
    const plain = inlinePlainText(block.content);
    const id = headingId?.(block.level, plain);
    const idAttr = id ? ` id="${escapeText(id)}"` : '';
    const inner = (block.content ?? []).map(renderInline).join('');
    return `<h${block.level}${idAttr}>${inner}</h${block.level}>`;
  }
  if (block.type === 'blockquote') {
    return `<blockquote>${block.content.map((child) => renderBlock(child, headingId)).join('')}</blockquote>`;
  }
  const tag = block.type === 'bulletList' ? 'ul' : 'ol';
  const items = block.content
    .map((item) => `<li>${item.content.map((child) => renderBlock(child, headingId)).join('')}</li>`)
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

/** Stored html has no ids. Pass `headingId` when a post-scoped slug should be written. */
export function renderProse(doc: ProseDoc, headingId?: HeadingId): string {
  return doc.content.map((block) => renderBlock(block, headingId)).join('');
}

export function inlinePlainText(content: readonly ProseInline[] | undefined): string {
  return (content ?? []).map((inline) => (inline.type === 'text' ? inline.text : '')).join('');
}

/** Inline markdown text. A `<` cannot become a tag. */
export function escapeMarkdownText(text: string): string {
  return text
    .replace(/[\\`*_{}[\]]/g, (character) => `\\${character}`)
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderMarkdownInline(inline: ProseInline): string {
  if (inline.type === 'hardBreak') return '  \n';
  let text = escapeMarkdownText(inline.text);
  const marks = inline.marks ?? [];
  const isBold = marks.some((mark) => mark.type === 'bold');
  const isItalic = marks.some((mark) => mark.type === 'italic');
  const link = marks.find((mark) => mark.type === 'link');
  if (isBold && isItalic) text = `***${text}***`;
  else if (isBold) text = `**${text}**`;
  else if (isItalic) text = `*${text}*`;
  if (link && link.type === 'link') text = `[${text}](${link.href})`;
  return text;
}

function renderMarkdownBlock(block: ProseBlock): string {
  if (block.type === 'paragraph') {
    return (block.content ?? []).map(renderMarkdownInline).join('');
  }
  if (block.type === 'heading') {
    const text = escapeMarkdownText(inlinePlainText(block.content));
    return `${'#'.repeat(block.level)} ${text}`;
  }
  if (block.type === 'blockquote') {
    const inner = block.content
      .map((child) => renderMarkdownBlock(child))
      .filter((part) => part.length > 0)
      .join('\n\n');
    return inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  }
  return renderMarkdownList(block.content, block.type === 'orderedList', 0);
}

function renderMarkdownList(
  items: { content: ProseBlock[] }[],
  ordered: boolean,
  depth: number,
): string {
  const pad = '  '.repeat(depth);
  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : '- ';
      const chunks = item.content
        .map((child) =>
          child.type === 'bulletList' || child.type === 'orderedList'
            ? renderMarkdownList(child.content, child.type === 'orderedList', depth + 1)
            : renderMarkdownBlock(child),
        )
        .filter((part) => part.length > 0);
      const lines = chunks.join('\n').split('\n');
      return [`${pad}${marker}${lines[0] ?? ''}`, ...lines.slice(1)].join('\n');
    })
    .join('\n');
}

/** The doc as markdown. Heading ids are not written here. */
export function proseToMarkdown(doc: ProseDoc): string {
  return doc.content
    .map(renderMarkdownBlock)
    .filter((part) => part.length > 0)
    .join('\n\n');
}
