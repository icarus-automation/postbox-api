import { Allow, IsObject } from 'class-validator';

export class CreateLeadDTO {
  // Keyed by lead field. The keys are data, not code, so LeadsService checks them
  // against the organization's fields.
  @IsObject()
  values: Record<string, unknown>;

  // The channel comes from the key that files the lead. A caller that sends one
  // anyway is not refused, and nothing reads it.
  @Allow()
  channel?: unknown;
}
