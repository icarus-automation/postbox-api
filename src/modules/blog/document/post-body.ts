import GithubSlugger from 'github-slugger';

import type {
  Block,
  HeadingLevel,
  PostHeading,
  ProseBlock,
  ProseDoc,
  PublicBlock,
  PublicImage,
  SanitizedHtml,
} from './blog.types';
import { BLOCK_KINDS, mediaTextHtml } from './block-registry';
import { claimHeadingId } from './heading-anchor';
import {
  escapeMarkdownText,
  escapeText,
  inlinePlainText,
  proseToMarkdown,
  renderProse,
} from './rich-text.codec';
import { sanitizePostHtml } from './sanitize-html';

type State = {
  slugger: GithubSlugger;
  headings: PostHeading[];
};

type RenderItem = {
  block: PublicBlock;
  anchor?: string;
};

export type ProjectedPostBody = {
  headings: PostHeading[];
  markdown: string;
  html: SanitizedHtml;
  blocks: Block[];
};

function claim(state: State, level: PostHeading['level'], text: string, anchor?: string): string {
  const id = claimHeadingId(state.slugger, text, anchor);
  state.headings.push({ level, text, id });
  return id;
}

function idsInDoc(doc: ProseDoc, state: State): string[] {
  const ids: string[] = [];
  const visit = (nodes: readonly ProseBlock[]): void => {
    for (const node of nodes) {
      if (node.type === 'heading') {
        ids.push(claim(state, node.level, inlinePlainText(node.content)));
      } else if (node.type === 'blockquote') {
        visit(node.content);
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        for (const item of node.content) visit(item.content);
      }
    }
  };
  visit(doc.content);
  return ids;
}

function applyHeadingIds(html: string, ids: readonly string[]): string {
  let index = 0;
  return html.replace(/<h([1-3])\b([^>]*)>/gi, (_match, level: string, attrs: string) => {
    const id = ids[index];
    index += 1;
    if (!id) return `<h${level}${attrs}>`;
    const cleaned = attrs.replace(/\s+id\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
    return `<h${level} id="${escapeText(id)}"${cleaned}>`;
  });
}

function imageMarkdown(image: { url: string; alt: string } | null): string {
  if (!image) return '';
  return `![${escapeMarkdownText(image.alt)}](${image.url})`;
}

function pushMarkdown(parts: string[], value: string): void {
  if (value.length > 0) parts.push(value);
}

function projectItems(items: readonly RenderItem[]): {
  headings: PostHeading[];
  markdown: string;
  html: SanitizedHtml;
} {
  const state: State = { slugger: new GithubSlugger(), headings: [] };
  const markup: string[] = [];
  const markdown: string[] = [];

  for (const item of items) {
    const block = item.block;
    if (block.kind === 'heading') {
      const id = claim(state, block.level, block.text, item.anchor);
      const raw = BLOCK_KINDS.heading.toHtml(block);
      markup.push(applyHeadingIds(raw, [id]));
      pushMarkdown(markdown, `${'#'.repeat(block.level)} ${escapeMarkdownText(block.text)}`);
      continue;
    }
    if (block.kind === 'rich_text') {
      const ids = idsInDoc(block.doc, state);
      const inner = applyHeadingIds(block.html, ids) as SanitizedHtml;
      markup.push(BLOCK_KINDS.rich_text.toHtml({ ...block, html: inner }));
      pushMarkdown(markdown, proseToMarkdown(block.doc));
      continue;
    }
    if (block.kind === 'media_text') {
      const ids: string[] = [];
      if (block.heading !== null) ids.push(claim(state, 2, block.heading));
      const proseIds = idsInDoc(block.doc, state);
      ids.push(...proseIds);
      const inner = applyHeadingIds(block.html, proseIds) as SanitizedHtml;
      const raw = BLOCK_KINDS.media_text.toHtml({ ...block, html: inner });
      markup.push(applyHeadingIds(raw, ids));
      const parts = [
        imageMarkdown(block.image),
        block.heading === null ? '' : `## ${escapeMarkdownText(block.heading)}`,
        proseToMarkdown(block.doc),
      ].filter((part) => part.length > 0);
      pushMarkdown(markdown, parts.join('\n\n'));
      continue;
    }
    if (block.kind === 'image') {
      markup.push(BLOCK_KINDS.image.toHtml(block));
      pushMarkdown(markdown, imageMarkdown(block.image));
      continue;
    }
    markup.push(BLOCK_KINDS.divider.toHtml(block));
    pushMarkdown(markdown, '---');
  }

  return {
    headings: state.headings,
    markdown: markdown.join('\n\n'),
    html: sanitizePostHtml(markup.join('\n')),
  };
}

/** Post html for a public block list. Heading ids are slugged from the visible text. */
export function renderBlocksHtml(blocks: readonly PublicBlock[]): SanitizedHtml {
  return projectItems(blocks.map((block) => ({ block }))).html;
}

function slotImage(block: Extract<Block, { kind: 'image' | 'media_text' }>): PublicImage | null {
  const media = block.image.media;
  if (!media) return null;
  return { url: media.url, alt: media.alt, contentType: media.contentType };
}

function takeProseHeading(state: State): (level: HeadingLevel, plain: string) => string {
  return (level, plain) => {
    const id = claimHeadingId(state.slugger, plain);
    state.headings.push({ level, text: plain, id });
    return id;
  };
}

function mediaHeadingTag(state: State, heading: string): string {
  const id = claimHeadingId(state.slugger, heading);
  state.headings.push({ level: 2, text: heading, id });
  return `<h2 id="${escapeText(id)}" class="pb-media-text__heading">${escapeText(heading)}</h2>`;
}

/**
 * Ids, markdown and html for one post. One slugger walks the blocks in order.
 * A heading block's stored anchor wins over its current text. Rich text is
 * rendered from the doc, not from the html stored at write time.
 */
export function projectPostBody(blocks: readonly Block[]): ProjectedPostBody {
  const state: State = { slugger: new GithubSlugger(), headings: [] };
  const onHeading = takeProseHeading(state);
  const markup: string[] = [];
  const markdown: string[] = [];
  const rendered = blocks.map((block) => {
    if (block.kind === 'heading') {
      const id = state.slugger.slug(block.anchor);
      state.headings.push({ level: block.level, text: block.text, id });
      markup.push(
        `<h${block.level} id="${escapeText(id)}" class="pb-heading">${escapeText(block.text)}</h${block.level}>`,
      );
      pushMarkdown(markdown, `${'#'.repeat(block.level)} ${escapeMarkdownText(block.text)}`);
      return block;
    }
    if (block.kind === 'rich_text') {
      const inner = sanitizePostHtml(renderProse(block.doc, onHeading));
      markup.push(`<div class="pb-rich-text">${inner}</div>`);
      pushMarkdown(markdown, proseToMarkdown(block.doc));
      return { ...block, html: inner };
    }
    if (block.kind === 'media_text') {
      const headingHtml = block.heading === null ? '' : mediaHeadingTag(state, block.heading);
      const inner = sanitizePostHtml(renderProse(block.doc, onHeading));
      markup.push(mediaTextHtml(block.side, slotImage(block), headingHtml, inner));
      const parts = [
        imageMarkdown(slotImage(block)),
        block.heading === null ? '' : `## ${escapeMarkdownText(block.heading)}`,
        proseToMarkdown(block.doc),
      ].filter((part) => part.length > 0);
      pushMarkdown(markdown, parts.join('\n\n'));
      return { ...block, html: inner };
    }
    if (block.kind === 'image') {
      const image = slotImage(block);
      markup.push(BLOCK_KINDS.image.toHtml({ kind: 'image', image }));
      pushMarkdown(markdown, imageMarkdown(image));
      return block;
    }
    markup.push(BLOCK_KINDS.divider.toHtml({ kind: 'divider' }));
    pushMarkdown(markdown, '---');
    return block;
  });

  return {
    headings: state.headings,
    markdown: markdown.join('\n\n'),
    html: sanitizePostHtml(markup.join('\n')),
    blocks: rendered,
  };
}
