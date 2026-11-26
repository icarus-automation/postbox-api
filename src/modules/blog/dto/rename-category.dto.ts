import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { SLUG_MAX_LENGTH } from '../document/slugs';
import { TERM_NAME_MAX_LENGTH } from '../terms';

export class RenameCategoryDTO {
  @IsString()
  @Length(1, TERM_NAME_MAX_LENGTH)
  name: string;

  // Blank keeps the current slug. A rename of the name never changes it.
  @IsOptional()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  slug?: string;
}
