import sanitize from 'sanitize-html';

import type { SanitizedHtml } from './blog.types';

const OPTIONS: sanitize.IOptions = {
  allowedTags: ['p', 'blockquote', 'ul', 'ol', 'li', 'br', 'strong', 'em', 'a', 'h1', 'h2', 'h3'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitizeHtml(dirty: string): SanitizedHtml {
  return sanitize(dirty, OPTIONS) as SanitizedHtml;
}

// The whole post: the rich text above plus what the block wrappers add. A class
// survives only when it starts with pb-, so a stray class or style never reaches a site.
const POST_OPTIONS: sanitize.IOptions = {
  allowedTags: [
    ...(OPTIONS.allowedTags as string[]),
    'h1',
    'h2',
    'h3',
    'div',
    'figure',
    'img',
    'hr',
  ],
  allowedAttributes: {
    a: ['href'],
    img: ['src', 'alt', 'loading'],
    h1: ['id'],
    h2: ['id'],
    h3: ['id'],
  },
  allowedClasses: { '*': ['pb-*'] },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // An image whose address was refused has nothing left to show.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

export function sanitizePostHtml(dirty: string): SanitizedHtml {
  return sanitize(dirty, POST_OPTIONS) as SanitizedHtml;
}
