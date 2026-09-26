import { IsString, Length } from 'class-validator';

import { TERM_NAME_MAX_LENGTH } from '../terms';

export class CreateCategoryDTO {
  @IsString()
  @Length(1, TERM_NAME_MAX_LENGTH)
  name: string;
}
