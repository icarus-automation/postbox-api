import type { FieldDefinition, LeadChannel } from '@prisma/client';

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

// A later submission from the same email or phone, kept on the lead it matched.
export type LeadSubmissionRecord = {
  id: string;
  channel: LeadChannel;
  // The values as sent, keyed by field key. Only the keys that were sent.
  values: Record<string, LeadFieldValue>;
  createdAt: Date;
};

export type OrganizationLead = {
  id: string;
  // Set from the key that filed the lead: form for the integration key, agent for
  // an admin API key.
  channel: LeadChannel;
  // An agent lead whose person has since sent the website form.
  nowInbound: boolean;
  // Every lead field key, in field order, with null where the lead has no value.
  values: Record<string, LeadFieldValue | null>;
  // Later submissions attached to this lead, oldest first.
  submissions: LeadSubmissionRecord[];
  // Out of the inbox, but still holding the status it reached.
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};
