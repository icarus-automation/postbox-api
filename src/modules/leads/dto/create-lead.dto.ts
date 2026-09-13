import { IsObject } from 'class-validator';

export class CreateLeadDTO {
  // Keyed by lead field. The keys are data, not code, so LeadsService checks them
  // against the organization's fields.
  @IsObject()
  values: Record<string, unknown>;
}
