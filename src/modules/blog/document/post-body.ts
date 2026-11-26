import GithubSlugger from 'github-slugger';

import type { Block, PostHeading, ProseBlock, ProseDoc, PublicBlock, SanitizedHtml } from './blog.types';
import { BLOCK_KINDS, toPublicBlocks } from './block-registry';
import { claimHeadingId } from './heading-anchor';
import { escapeText, inlinePlainText, proseToMarkdown } from './rich-text.codec';
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
  const alt = image.alt.replace(/[[\]]/g, (character) => `\\${character}`);
  return `![${alt}](${image.url})`;
}

function pushMarkdown(parts: string[], value: string): void {
  if (value.length > 0) parts.push(value);
}

function projectItems(items: readonly RenderItem[]): {
  headings: PostHeading[];
  markdown: string;
  html: SanitizedHtml;
  inners: Array<SanitizedHtml | null>;
} {
  const state: State = { slugger: new GithubSlugger(), headings: [] };
  const markup: string[] = [];
  const markdown: string[] = [];
  const inners: Array<SanitizedHtml | null> = [];

  for (const item of items) {
    const block = item.block;
    if (block.kind === 'heading') {
      const id = claim(state, block.level, block.text, item.anchor);
      const raw = BLOCK_KINDS.heading.toHtml(block);
      markup.push(applyHeadingIds(raw, [id]));
      pushMarkdown(markdown, `${'#'.repeat(block.level)} ${block.text}`);
      inners.push(null);
      continue;
    }
    if (block.kind === 'rich_text') {
      const ids = idsInDoc(block.doc, state);
      const inner = applyHeadingIds(block.html, ids) as SanitizedHtml;
      markup.push(BLOCK_KINDS.rich_text.toHtml({ ...block, html: inner }));
      pushMarkdown(markdown, proseToMarkdown(block.doc));
      inners.push(inner);
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
        block.heading === null ? '' : `## ${block.heading}`,
        proseToMarkdown(block.doc),
      ].filter((part) => part.length > 0);
      pushMarkdown(markdown, parts.join('\n\n'));
      inners.push(inner);
      continue;
    }
    if (block.kind === 'image') {
      markup.push(BLOCK_KINDS.image.toHtml(block));
      pushMarkdown(markdown, imageMarkdown(block.image));
      inners.push(null);
      continue;
    }
    markup.push(BLOCK_KINDS.divider.toHtml(block));
    pushMarkdown(markdown, '---');
    inners.push(null);
  }

  return {
    headings: state.headings,
    markdown: markdown.join('\n\n'),
    html: sanitizePostHtml(markup.join('\n')),
    inners,
  };
}

/** Post html for a public block list. Heading ids are slugged from the visible text. */
export function renderBlocksHtml(blocks: readonly PublicBlock[]): SanitizedHtml {
  return projectItems(blocks.map((block) => ({ block }))).html;
}

/**
 * Ids, markdown and html for one post. A heading block's stored anchor wins over
 * its current text. Rich text and media headings are slugged as they are read.
 * The slugger runs once, in document order, so a repeated name gets `-1`, `-2`.
 */
export function projectPostBody(blocks: readonly Block[]): ProjectedPostBody {
  const publicBlocks = toPublicBlocks([...blocks]);
  const projected = projectItems(
    blocks.map((block, index) => ({
      block: publicBlocks[index],
      anchor: block.kind === 'heading' ? block.anchor : undefined,
    })),
  );
  return {
    headings: projected.headings,
    markdown: projected.markdown,
    html: projected.html,
    blocks: blocks.map((block, index) => {
      const inner = projected.inners[index];
      if ((block.kind === 'rich_text' || block.kind === 'media_text') && inner !== null) {
        return { ...block, html: inner };
      }
      return block;
    }),
  };
}
