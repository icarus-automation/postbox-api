import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';
import {
  CONTENT_STATUSES,
  ENTRY_KINDS,
  type EntryKind,
} from '../document/content.types';

export class FilterContentDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsIn(ENTRY_KINDS)
  kind?: EntryKind;

  @IsOptional()
  @IsIn(CONTENT_STATUSES)
  status?: (typeof CONTENT_STATUSES)[number];
}
