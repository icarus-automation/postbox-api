import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { SLUG_MAX_LENGTH } from '../document/slugs';
import { TERM_NAME_MAX_LENGTH } from '../terms';

export class CreateCategoryDTO {
  @IsString()
  @Length(1, TERM_NAME_MAX_LENGTH)
  name: string;

  // Blank means the slug is made from the name. A value must already be a slug.
  @IsOptional()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;
}
