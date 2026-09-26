import type { Slug } from './blog.types';
import { SLUG_MAX_LENGTH, SLUG_PATTERN, firstFreeSlug, slugStem, slugify } from './slugs';

describe('slugify', () => {
  it('makes lowercase words joined by single hyphens', () => {
    expect(slugify('  Spring   openings: 2026 edition! ')).toBe('spring-openings-2026-edition');
  });

  it('folds accents to the base letter', () => {
    expect(slugify('Café crème à Zürich')).toBe('cafe-creme-a-zurich');
  });

  it('is empty when there is no letter or digit to use', () => {
    expect(slugify('!!! ???')).toBe('');
    expect(slugify('日本語')).toBe('');
  });

  it('stays within the length a slug can have, without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(199)} b`);

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});

describe('firstFreeSlug', () => {
  const base = 'spring-openings' as Slug;

  it('keeps the base when nothing has it', () => {
    expect(firstFreeSlug(base, new Set(['spring']))).toBe('spring-openings');
  });

  it('counts up from -2 past every taken number', () => {
    expect(firstFreeSlug(base, new Set([base, `${base}-2`, `${base}-3`]))).toBe(
      'spring-openings-4',
    );
  });

  it('cuts a long base so the numbered slug still fits', () => {
    const long = 'a'.repeat(SLUG_MAX_LENGTH) as Slug;

    const slug = firstFreeSlug(long, new Set([long]));

    expect(slug).toHaveLength(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-2')).toBe(true);
    expect(slug.startsWith(slugStem(long))).toBe(true);
  });
});
