import { ConflictException } from '@nestjs/common';

import {
  isUniqueConstraintViolation,
  type UniqueConstraint,
} from '../../core/database/prisma-errors';
import type { Slug } from './document/blog.types';
import { firstFreeSlug, slugStem } from './document/slugs';

// Another writer can take the slug between the read and the write. Each retry
// reads the taken slugs again.
const ATTEMPTS = 3;

/**
 * Writes with `wanted`, or with the first free `wanted-2`, `wanted-3`, and on.
 * `takenSlugs` returns the slugs other rows hold that start with the stem.
 */
export async function writeWithFreeSlug<T>(input: {
  wanted: Slug;
  constraint: UniqueConstraint;
  takenSlugs: (stem: string) => Promise<string[]>;
  write: (slug: Slug) => Promise<T>;
}): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    const taken = await input.takenSlugs(slugStem(input.wanted));
    const slug = firstFreeSlug(input.wanted, new Set(taken));
    try {
      return await input.write(slug);
    } catch (error) {
      if (!isUniqueConstraintViolation(error, input.constraint)) throw error;
      if (attempt >= ATTEMPTS) throw new ConflictException('Slug already exists');
    }
  }
}
