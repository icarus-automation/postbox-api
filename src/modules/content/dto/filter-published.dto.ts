import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';
import { ENTRY_KINDS, type EntryKind } from '../document/content.types';

export class FilterPublishedDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsIn(ENTRY_KINDS)
  kind?: EntryKind;
}
