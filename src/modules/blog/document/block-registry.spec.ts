import {
  BLOCK_KINDS,
  readBlocks,
  toPublicBlocks,
} from './block-registry';
import { renderBlocksHtml } from './post-body';
import {
  DraftRejected,
  type BlockId,
  type HttpUrl,
  type PublicBlock,
  type PublicImage,
  type SanitizedHtml,
} from './blog.types';

const id = 'block-1' as BlockId;

const photo: PublicImage = {
  url: 'https://media.example.com/photo.png' as HttpUrl,
  alt: 'The team',
  contentType: 'image/png',
};

const proseHtml = '<p>We are <strong>hiring</strong>.</p>' as SanitizedHtml;
const emptyDoc = { type: 'doc', content: [] } as const;

const everyKind: PublicBlock[] = [
  { kind: 'heading', level: 2, text: 'Open roles' },
  { kind: 'rich_text', doc: emptyDoc, html: proseHtml },
  { kind: 'image', image: photo },
  {
    kind: 'media_text',
    side: 'image_left',
    image: photo,
    heading: 'Why join us',
    doc: emptyDoc,
    html: proseHtml,
  },
  { kind: 'divider' },
];

describe('BLOCK_KINDS', () => {
  it('turns markdown into stored doc and sanitized html', () => {
    const block = BLOCK_KINDS.rich_text.parse(
      { markdown: 'We are **hiring**.' },
      new Map(),
      id,
    );

    expect(block.kind).toBe('rich_text');
    expect(block.html).toContain('<strong>hiring</strong>');
    expect(block).not.toHaveProperty('markdown');
  });

  it('keeps a markdown heading inside rich text', () => {
    const block = BLOCK_KINDS.rich_text.parse({ markdown: '## Readings' }, new Map(), id);

    expect(block.doc.content[0]).toEqual({
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: 'Readings' }],
    });
    expect(block.html).toBe('<h2>Readings</h2>');
  });

  it('rejects rich text that sends markdown and a doc', () => {
    expect(() =>
      BLOCK_KINDS.rich_text.parse(
        { markdown: 'Hi', doc: { type: 'doc', content: [] } },
        new Map(),
        id,
      ),
    ).toThrow(DraftRejected);
  });
});

describe('renderBlocksHtml', () => {
  it('gives every block kind its pb- class, in block order', () => {
    const html = renderBlocksHtml(everyKind);

    expect(html).toBe(
      [
        '<h2 id="open-roles" class="pb-heading">Open roles</h2>',
        '<div class="pb-rich-text"><p>We are <strong>hiring</strong>.</p></div>',
        '<figure class="pb-image"><img src="https://media.example.com/photo.png" alt="The team" loading="lazy" /></figure>',
        '<div class="pb-media-text pb-media-text--image-left">' +
          '<figure class="pb-media-text__media"><img src="https://media.example.com/photo.png" alt="The team" loading="lazy" /></figure>' +
          '<div class="pb-media-text__body"><h2 id="why-join-us" class="pb-media-text__heading">Why join us</h2><p>We are <strong>hiring</strong>.</p></div>' +
          '</div>',
        '<hr class="pb-divider" />',
      ].join('\n'),
    );
  });

  it('has a row for every block kind, so a new kind cannot ship without markup', () => {
    for (const kind of Object.keys(BLOCK_KINDS)) {
      expect(typeof BLOCK_KINDS[kind as keyof typeof BLOCK_KINDS].toHtml).toBe('function');
    }
    const kinds = new Set(everyKind.map((block) => block.kind));
    expect([...kinds].sort()).toEqual(Object.keys(BLOCK_KINDS).sort());
  });

  it('uses the heading level for the tag', () => {
    const html = renderBlocksHtml([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 3, text: 'Three' },
    ]);

    expect(html).toBe(
      '<h1 id="one" class="pb-heading">One</h1>\n<h3 id="three" class="pb-heading">Three</h3>',
    );
  });

  it('puts the image after the text when the block says image_right', () => {
    const html = renderBlocksHtml([
      {
        kind: 'media_text',
        side: 'image_right',
        image: photo,
        heading: null,
        doc: emptyDoc,
        html: proseHtml,
      },
    ]);

    expect(html.startsWith('<div class="pb-media-text pb-media-text--image-right">')).toBe(true);
    expect(html.indexOf('pb-media-text__body')).toBeLessThan(html.indexOf('pb-media-text__media'));
    expect(html).not.toContain('pb-media-text__heading');
  });

  it('leaves out the figure of a media block with no image, and an empty image block', () => {
    const html = renderBlocksHtml([
      { kind: 'image', image: null },
      {
        kind: 'media_text',
        side: 'image_left',
        image: null,
        heading: null,
        doc: emptyDoc,
        html: proseHtml,
      },
    ]);

    expect(html).not.toContain('<figure');
    expect(html).not.toContain('<img');
    expect(html).toContain('pb-media-text--image-left');
    expect(html).toContain('pb-media-text__body');
  });

  it('renders no markup for a post with no blocks', () => {
    expect(renderBlocksHtml([])).toBe('');
  });

  describe('sanitizing', () => {
    it('escapes the text of headings and alt text', () => {
      const html = renderBlocksHtml([
        { kind: 'heading', level: 2, text: '<script>alert(1)</script> & "more"' },
        { kind: 'image', image: { ...photo, alt: '"><img src=x onerror=alert(1)>' } },
        {
          kind: 'media_text',
          side: 'image_left',
          image: null,
          heading: '<img src=x onerror=alert(1)>',
          doc: emptyDoc,
          html: proseHtml,
        },
      ]);

      // The attack text survives only as escaped text, so the only tags are ours.
      const tags = [...html.matchAll(/<([a-z0-9]+)/g)].map((match) => match[1]);
      expect(tags).toEqual(['h2', 'figure', 'img', 'div', 'div', 'h2', 'p', 'strong']);
      expect(html).toContain(
        '<h2 id="scriptalert1script--more" class="pb-heading">&lt;script&gt;alert(1)&lt;/script&gt; &amp; "more"</h2>',
      );
      expect(html).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
      expect(html).toContain(
        '<h2 id="img-srcx-onerroralert1" class="pb-media-text__heading">&lt;img src=x onerror=alert(1)&gt;</h2>',
      );
    });

    it('drops unsafe markup that reaches a rich text block', () => {
      const dirty =
        '<p onclick="steal()" style="color:red" class="evil">Hi <a href="javascript:alert(1)">x</a>' +
        '<script>alert(1)</script><iframe src="https://evil.example"></iframe></p>';
      const html = renderBlocksHtml([
        { kind: 'rich_text', doc: emptyDoc, html: dirty as SanitizedHtml },
      ]);

      expect(html).toBe('<div class="pb-rich-text"><p>Hi <a>x</a></p></div>');
    });

    it('keeps a class only when it starts with pb-', () => {
      const html = renderBlocksHtml([
        {
          kind: 'rich_text',
          doc: emptyDoc,
          html: '<p class="pb-extra btn-danger">Hi</p>' as SanitizedHtml,
        },
      ]);

      expect(html).toContain('<p class="pb-extra">Hi</p>');
    });

    it('refuses an image address that is not http or https', () => {
      const html = renderBlocksHtml([
        { kind: 'image', image: { ...photo, url: 'javascript:alert(1)' as HttpUrl } },
        { kind: 'image', image: { ...photo, url: 'data:image/png;base64,AAAA' as HttpUrl } },
        { kind: 'image', image: { ...photo, url: '//evil.example/x.png' as HttpUrl } },
      ]);

      expect(html).not.toContain('<img');
      expect(html).not.toMatch(/javascript:|data:image|evil\.example/);
    });

    it('allows only the elements and attributes the guide lists', () => {
      const html = renderBlocksHtml(everyKind);
      const tags = new Set([...html.matchAll(/<([a-z0-9]+)[\s>/]/g)].map((match) => match[1]));
      const attributes = new Set([...html.matchAll(/\s([a-z-]+)=/g)].map((match) => match[1]));

      expect([...tags].sort()).toEqual(
        ['div', 'figure', 'h2', 'hr', 'img', 'p', 'strong'].sort(),
      );
      expect([...attributes].sort()).toEqual(['alt', 'class', 'id', 'loading', 'src']);
    });
  });
});

describe('toPublicBlocks and renderBlocksHtml together', () => {
  it('renders the blocks a stored post reads back', () => {
    const stored = readBlocks([
      { id: 'a', kind: 'heading', level: 3, text: 'Stored' },
      { id: 'b', kind: 'divider' },
    ]);

    expect(renderBlocksHtml(toPublicBlocks(stored))).toBe(
      '<h3 id="stored" class="pb-heading">Stored</h3>\n<hr class="pb-divider" />',
    );
  });
});
