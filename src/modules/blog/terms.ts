import { BadRequestException } from '@nestjs/common';

import type { PublishedTerm, Slug, TermJson, TermRef } from './document/blog.types';
import { slugify } from './document/slugs';

// Categories and tags share these rules. Each has its own table and service.

export const TERM_NAME_MAX_LENGTH = 80;

type TermRow = { id: string; name: string; slug: string };
type CountedRow = { name: string; slug: string; _count: { posts: number } };

/** The name as stored: trimmed, with each run of spaces made one. */
export function termName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1) throw new BadRequestException('Name is required');
  return name;
}

/** The slug a name makes. A name with no letter or digit to make one from is refused. */
export function termSlug(name: string): Slug {
  const slug = slugify(name);
  if (!slug) throw new BadRequestException('Use a name with a letter or a number');
  return slug as Slug;
}

export function termRef(row: TermRow): TermRef {
  return { id: row.id, name: row.name, slug: row.slug as Slug };
}

export function toTermJson(row: TermRow & CountedRow): TermJson {
  return { ...termRef(row), postCount: row._count.posts };
}

export function toPublishedTerm(row: CountedRow): PublishedTerm {
  return { name: row.name, slug: row.slug as Slug, postCount: row._count.posts };
}
