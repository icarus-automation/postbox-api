import { DraftRejected, type OrganizationId } from './blog.types';
import { parseBlocks } from './block-registry';
import { applyFields, blankDraft, publishedEvent, toEditorJson, toPublicPost } from './post-document';
import { projectPostBody } from './post-body';
import { utilityBillingBlocks } from '../../../../test/utility-billing.fixture';

const ORGANIZATION = 'organization-a' as OrganizationId;

function headingIds(html: string): string[] {
  return [...html.matchAll(/<h[1-3]\b[^>]*>/gi)]
    .map((match) => /id="([^"]*)"/.exec(match[0])?.[1])
    .filter((id): id is string => id !== undefined);
}

function markdownHeadings(markdown: string): Array<{ level: number; text: string }> {
  return markdown
    .split('\n')
    .map((line) => /^(#{1,3}) (.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ level: match[1].length, text: match[2] }));
}

describe('utility billing post', () => {
  const blocks = utilityBillingBlocks();
  const body = projectPostBody(blocks);

  it('gives Readings id="readings" and the duplicate id="readings-1"', () => {
    expect(body.html).toContain('id="readings"');
    expect(body.html).toContain('id="readings-1"');
    const readings = body.headings.filter((heading) => heading.text === 'Readings');
    expect(readings.map((heading) => heading.id)).toEqual(['readings', 'readings-1']);
  });

  it('keeps headings, html ids, and markdown headings in the same order', () => {
    expect(headingIds(body.html)).toEqual(body.headings.map((heading) => heading.id));
    expect(markdownHeadings(body.markdown)).toEqual(
      body.headings.map((heading) => ({ level: heading.level, text: heading.text })),
    );
  });

  it('renders eight sections, numbered steps, and a nested list, with no html tags', () => {
    const sections = body.markdown
      .split('\n')
      .filter((line) => line.startsWith('## ') && !line.startsWith('### '));
    expect(sections).toEqual([
      '## Overview',
      '## Readings',
      '## Submitting a reading',
      '## Rates',
      '## Billing cycle',
      '## Payments',
      '## Readings',
      '## Questions',
    ]);
    expect(body.markdown).toContain('1. Photograph the dials');
    expect(body.markdown).toContain('   - Include the meter number');
    expect(body.markdown).toContain('2. Enter the **digits** left to right');
    expect(body.markdown).toContain('- Weekday energy');
    expect(body.markdown).toContain('### When is my bill due?');
    expect(body.markdown).toContain('### What if I miss a reading?');
    expect(body.markdown).not.toMatch(/<\/?(p|strong|em|h[1-6]|ul|ol|li|div|a|br)\b/i);
  });

  it('keeps the Readings anchor when the heading text changes', () => {
    let doc = blankDraft(ORGANIZATION);
    doc = applyFields(
      doc,
      { title: 'Utility billing', blocks: blocks },
      { media: new Map() },
    );
    const readings = doc.blocks.find(
      (block) => block.kind === 'heading' && block.id === 'readings',
    );
    expect(readings && readings.kind === 'heading' ? readings.anchor : '').toBe('readings');

    const edited = applyFields(
      doc,
      {
        blocks: doc.blocks.map((block) =>
          block.kind === 'heading' && block.id === 'readings'
            ? { id: block.id, kind: 'heading', level: block.level, text: 'Meter readings' }
            : block,
        ),
      },
      { media: new Map() },
    );
    const next = projectPostBody(edited.blocks);
    const first = next.headings.find((heading) => heading.text === 'Meter readings');
    expect(first).toEqual({ level: 2, text: 'Meter readings', id: 'readings' });
    expect(next.html).toContain('id="readings"');
    expect(next.headings.filter((heading) => heading.id === 'readings-1')).toEqual([
      { level: 2, text: 'Readings', id: 'readings-1' },
    ]);
  });

  it('puts headings and markdown on the public post and the editor post, not the webhook', () => {
    let doc = blankDraft(ORGANIZATION);
    doc = applyFields(doc, { title: 'Utility billing', blocks }, { media: new Map() });
    doc = {
      ...doc,
      publication: { status: 'published', publishedAt: new Date('2026-11-01T00:00:00.000Z') },
    };

    const event = publishedEvent(doc, 'acme');
    expect(event.post).not.toHaveProperty('headings');
    expect(event.post).not.toHaveProperty('markdown');
    expect(event.post.html).toContain('id="readings"');
    expect(event.type).toBe('post.published');

    const post = toPublicPost(doc);
    expect(post.headings.map((heading) => heading.id)).toEqual(headingIds(post.html));
    expect(post.markdown).toContain('## Readings');
    expect(post.blocks.find((block) => block.kind === 'heading')).not.toHaveProperty('anchor');

    const editor = toEditorJson(doc);
    const stored = editor.blocks.find((block) => block.kind === 'heading' && block.text === 'Readings');
    expect(stored && stored.kind === 'heading' ? stored.anchor : '').toBe('readings');
    expect(editor.markdown).toBe(post.markdown);
  });
});

describe('heading anchors', () => {
  it('rejects an anchor that is not a github slug', () => {
    expect(() =>
      parseBlocks(
        [{ kind: 'heading', level: 2, text: 'Readings', anchor: 'Meter Readings' }],
        new Map(),
      ),
    ).toThrow(DraftRejected);
  });

  it('uses an explicit anchor, then suffixes the next copy', () => {
    const blocks = parseBlocks(
      [
        { id: 'a', kind: 'heading', level: 2, text: 'Something else', anchor: 'readings' },
        { id: 'b', kind: 'heading', level: 2, text: 'Readings' },
      ],
      new Map(),
    );
    expect(projectPostBody(blocks).headings.map((heading) => heading.id)).toEqual([
      'readings',
      'readings-1',
    ]);
  });

  it('shares one slugger across a heading block, rich text, and media text', () => {
    const blocks = parseBlocks(
      [
        { id: 'a', kind: 'heading', level: 2, text: 'Notes' },
        { id: 'b', kind: 'rich_text', markdown: '### Notes' },
        {
          id: 'c',
          kind: 'media_text',
          side: 'image_left',
          heading: 'Notes',
          doc: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
      ],
      new Map(),
    );
    expect(projectPostBody(blocks).headings.map((heading) => heading.id)).toEqual([
      'notes',
      'notes-1',
      'notes-2',
    ]);
  });
});
