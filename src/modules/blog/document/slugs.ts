import type { Slug } from './blog.types';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 200;

// A suffix never needs more than this many characters, so every candidate for a
// base starts with the base cut to the rest.
const SUFFIX_ROOM = 10;

/**
 * Lowercase letters and digits joined by single hyphens. Accented letters fold to
 * their base letter, and anything else becomes a hyphen. Empty when the text has
 * no letter or digit a web address can carry.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** What every candidate for `base` starts with. Read the taken slugs with it. */
export function slugStem(base: Slug): string {
  return base.slice(0, SLUG_MAX_LENGTH - SUFFIX_ROOM);
}

/** `base` when it is free, otherwise the first free of `base-2`, `base-3`, and on. */
export function firstFreeSlug(base: Slug, taken: ReadonlySet<string>): Slug {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const stem = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate as Slug;
  }
}
