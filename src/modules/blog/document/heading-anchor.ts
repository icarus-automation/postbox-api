import GithubSlugger from 'github-slugger';

export const HEADING_ANCHOR_MAX = 200;

/** The slug `github-slugger` would give this text, with no duplicate suffix. */
export function pureHeadingSlug(value: string): string {
  return GithubSlugger.slug(value);
}

/**
 * The anchor stored on a heading block the first time it is saved.
 * Punctuation-only text has no slug, so it is stored as `section`.
 */
export function baseHeadingAnchor(text: string): string {
  const slug = pureHeadingSlug(text);
  return slug.length > 0 ? slug : 'section';
}

/** True when `value` is already a github-slugger slug of itself. */
export function isHeadingAnchor(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= HEADING_ANCHOR_MAX &&
    pureHeadingSlug(value) === value
  );
}

/**
 * The id this heading takes in the current post.
 * A stored anchor is claimed as itself. Other headings are slugged from their text.
 */
export function claimHeadingId(
  slugger: GithubSlugger,
  text: string,
  anchor?: string,
): string {
  if (anchor !== undefined) return slugger.slug(anchor);
  return slugger.slug(baseHeadingAnchor(text));
}
