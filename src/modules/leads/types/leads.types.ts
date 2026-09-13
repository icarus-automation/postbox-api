import type { FieldDefinition } from '@prisma/client';

export type LeadField = Pick<
  FieldDefinition,
  | 'id'
  | 'key'
  | 'label'
  | 'type'
  | 'options'
  | 'isRequired'
  | 'isReadOnly'
  | 'isSystem'
  | 'position'
>;

export type LeadFieldValue = string | number;

export type OrganizationLead = {
  id: string;
  // Every lead field key, in field order, with null where the lead has no value.
  values: Record<string, LeadFieldValue | null>;
  createdAt: Date;
  updatedAt: Date;
};
