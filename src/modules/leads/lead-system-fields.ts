import { FieldCollection, FieldType } from '@prisma/client';

import type { PrismaService } from '../../core/database/prisma.service';

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'archived',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_INITIAL_STATUS: LeadStatus = 'new';

export const LEAD_STATUS_KEY = 'status';
export const LEAD_RECEIVED_AT_KEY = 'receivedAt';

type LeadSystemField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  isRequired?: boolean;
  isReadOnly?: boolean;
};

// Every organization starts with these fields, in this order, and cannot delete
// them. The read-only two are never written through lead values: a lead starts at
// the initial status and only PATCH /leads/:id/status moves it, while receivedAt
// is the moment the lead row was created.
const LEAD_SYSTEM_FIELDS: LeadSystemField[] = [
  {
    key: 'candidate',
    label: 'Candidate',
    type: FieldType.text,
    isRequired: true,
  },
  {
    key: 'product',
    label: 'Product',
    type: FieldType.select,
    options: ['POS', 'PMS', 'Other'],
    isRequired: true,
  },
  { key: 'source', label: 'Source', type: FieldType.url, isRequired: true },
  {
    key: 'signal',
    label: 'Signal',
    type: FieldType.long_text,
    isRequired: true,
  },
  {
    key: 'whyLead',
    label: 'Why lead',
    type: FieldType.long_text,
    isRequired: true,
  },
  { key: 'draftOpener', label: 'Draft opener', type: FieldType.long_text },
  {
    key: LEAD_STATUS_KEY,
    label: 'Status',
    type: FieldType.select,
    options: [...LEAD_STATUSES],
    isReadOnly: true,
  },
  {
    key: LEAD_RECEIVED_AT_KEY,
    label: 'Received',
    type: FieldType.datetime,
    isReadOnly: true,
  },
];

export async function provisionLeadSystemFields(
  db: PrismaService,
  organizationId: string,
): Promise<void> {
  await db.fieldDefinition.createMany({
    data: LEAD_SYSTEM_FIELDS.map((field, position) => ({
      ...field,
      organizationId,
      collection: FieldCollection.lead,
      isSystem: true,
      position,
    })),
  });
}
