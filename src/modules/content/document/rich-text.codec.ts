import Blockquote from '@tiptap/extension-blockquote';
import Bold from '@tiptap/extension-bold';
import BulletList from '@tiptap/extension-bullet-list';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import OrderedList from '@tiptap/extension-ordered-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { MarkdownManager } from '@tiptap/markdown';

import { DraftRejected, type HttpUrl, type ProseBlock, type ProseDoc, type ProseInline, type ProseMark } from './content.types';

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

function escapeText(value: string): string {
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

function renderBlock(block: ProseBlock): string {
  if (block.type === 'paragraph') {
    return `<p>${(block.content ?? []).map(renderInline).join('')}</p>`;
  }
  if (block.type === 'blockquote') {
    return `<blockquote>${block.content.map(renderBlock).join('')}</blockquote>`;
  }
  const tag = block.type === 'bulletList' ? 'ul' : 'ol';
  const items = block.content
    .map((item) => `<li>${item.content.map(renderBlock).join('')}</li>`)
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

export function renderProse(doc: ProseDoc): string {
  return doc.content.map(renderBlock).join('');
}
