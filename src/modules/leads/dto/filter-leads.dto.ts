import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, Length, ValidateIf } from 'class-validator';

import { PaginationQueryDTO } from '../../../common/dto/pagination-query.dto';
import { LEAD_STATUSES, type LeadStatus } from '../lead-system-fields';

const hasLookup = (query: FilterLeadsDTO): boolean =>
  query.field !== undefined || query.value !== undefined;

// A query string only carries text, and the global pipe does not convert types
// on its own. Anything but the two words it knows passes through untouched, so
// IsBoolean refuses it rather than reading as false.
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class FilterLeadsDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  // The inbox and the archive are separate lists, so this picks one of them.
  @Transform(toBoolean)
  @IsBoolean()
  archived: boolean = false;

  // An exact-match lookup on one lead field, such as field=source&value=<url>,
  // which lets an agent check for a lead it already filed. Each needs the other,
  // and LeadsService checks the key against the organization's fields.
  @ValidateIf(hasLookup)
  @Length(1, 40, {
    message: 'field must be 1 to 40 characters, given together with value',
  })
  field?: string;

  @ValidateIf(hasLookup)
  @Length(1, 5000, {
    message: 'value must be 1 to 5000 characters, given together with field',
  })
  value?: string;
}
