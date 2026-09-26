import { IsOptional, Matches, MaxLength } from 'class-validator';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';
import { SLUG_PATTERN } from '../document/slugs';

export class FilterPublishedPostsDTO extends PaginationQueryDTO {
  @IsOptional()
  @MaxLength(200)
  @Matches(SLUG_PATTERN, { message: 'category must be a category slug' })
  category?: string;

  @IsOptional()
  @MaxLength(200)
  @Matches(SLUG_PATTERN, { message: 'tag must be a tag slug' })
  tag?: string;
}
