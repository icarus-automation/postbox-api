import { IsNotEmptyObject } from 'class-validator';

export class UpdateLeadValuesDTO {
  // Only the given keys change. LeadsService checks them against the
  // organization's fields.
  @IsNotEmptyObject()
  values: Record<string, unknown>;
}
