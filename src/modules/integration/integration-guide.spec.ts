import { renderBlocksHtml } from '../blog/document/block-registry';
import type {
  HttpUrl,
  PublicBlock,
  SanitizedHtml,
} from '../blog/document/blog.types';
import { renderIntegrationGuide } from './integration-guide';

const API = 'https://postbox-api.example.com/api/v1';

// One of each, with every optional part present, so every class shows up.
function everyClass(): string[] {
  const image = {
    url: 'https://media.example.com/a.png' as HttpUrl,
    alt: 'A',
    contentType: 'image/png' as const,
  };
  const doc = { type: 'doc', content: [] } as const;
  const html = '<p>Text</p>' as SanitizedHtml;
  const blocks: PublicBlock[] = [
    { kind: 'heading', level: 2, text: 'H' },
    { kind: 'rich_text', doc, html },
    { kind: 'image', image },
    { kind: 'media_text', side: 'image_left', image, heading: 'H', doc, html },
    { kind: 'media_text', side: 'image_right', image, heading: 'H', doc, html },
    { kind: 'divider' },
  ];
  const markup = renderBlocksHtml(blocks);
  return [...new Set([...markup.matchAll(/pb-[a-z_-]+/g)].map((match) => match[0]))];
}

describe('integration guide', () => {
  const guide = renderIntegrationGuide(API);

  it('carries the address of this API in place of the token', () => {
    expect(guide).not.toContain('{{apiBaseUrl}}');
    expect(guide).toContain(`${API}/docs/integration.md`);
    expect(guide).toContain(`${API}/public/acme-inc/blog/posts`);
  });

  it('names every route a website calls', () => {
    for (const route of [
      'GET /public/{orgSlug}/blog/posts',
      'GET /public/{orgSlug}/blog/posts/{slug}',
      'GET /public/{orgSlug}/blog/categories',
      'GET /public/{orgSlug}/blog/tags',
      'POST /public/{orgSlug}/leads',
    ]) {
      expect(guide).toContain(route);
    }
  });

  it('names the header, and no header that the API no longer reads', () => {
    expect(guide).toContain('x-integration-key');
    expect(guide).not.toContain('x-public-key');
  });

  it('documents every pb- class the html field can carry', () => {
    const classes = everyClass();

    expect(classes).toEqual(
      expect.arrayContaining([
        'pb-heading',
        'pb-rich-text',
        'pb-image',
        'pb-media-text',
        'pb-media-text--image-left',
        'pb-media-text--image-right',
        'pb-media-text__media',
        'pb-media-text__body',
        'pb-media-text__heading',
        'pb-divider',
      ]),
    );
    for (const name of classes) {
      expect(guide).toContain(name);
    }
  });

  it('names the three webhook events and the signature header', () => {
    for (const name of ['post.published', 'post.unpublished', 'post.updated', 'X-Blog-Signature']) {
      expect(guide).toContain(name);
    }
  });

  it('keeps to the house style: no em or en dashes', () => {
    // Built from character codes, so this file holds no dash itself.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(guide).not.toMatch(dashes);
  });
});
