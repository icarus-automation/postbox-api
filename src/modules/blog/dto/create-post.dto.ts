import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

import { MAX_TAGS_PER_POST } from '../document/blog.types';
import { SLUG_PATTERN } from '../document/slugs';

export class CreatePostDTO {
  @IsString()
  @Length(1, 200)
  title: string;

  // Left out or null, the slug is made from the title, and follows it while the
  // post is a draft. A slug that is taken gets -2, -3 and so on.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(1, 200)
  @Matches(SLUG_PATTERN)
  slug?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  metaDescription?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  ogImageId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  coverImageId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_POST)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  blocks?: unknown[];
}
