import sanitize from 'sanitize-html';

import type { SanitizedHtml } from './content.types';

const OPTIONS: sanitize.IOptions = {
  allowedTags: ['p', 'blockquote', 'ul', 'ol', 'li', 'br', 'strong', 'em', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitizeHtml(dirty: string): SanitizedHtml {
  return sanitize(dirty, OPTIONS) as SanitizedHtml;
}
