import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';
import { POST_STATUSES, type PostStatus } from '../document/blog.types';
import { SLUG_PATTERN } from '../document/slugs';

export class FilterPostsDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsIn(POST_STATUSES)
  status?: PostStatus;

  @IsOptional()
  @MaxLength(200)
  @Matches(SLUG_PATTERN, { message: 'category must be a category slug' })
  category?: string;

  @IsOptional()
  @MaxLength(200)
  @Matches(SLUG_PATTERN, { message: 'tag must be a tag slug' })
  tag?: string;

  // Part of a title, in any case.
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;
}
