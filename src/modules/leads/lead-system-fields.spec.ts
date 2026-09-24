import { FieldCollection, FieldType, type Prisma } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import {
  LEAD_STATUSES,
  provisionLeadSystemFields,
} from './lead-system-fields';

type ProvisionedField = Prisma.FieldDefinitionCreateManyInput;

describe('provisionLeadSystemFields', () => {
  const prisma = mockDeep<PrismaService>();

  let provisioned: ProvisionedField[];

  beforeAll(async () => {
    prisma.fieldDefinition.createMany.mockResolvedValue({ count: 0 });

    await provisionLeadSystemFields(prisma, 'organization-a');

    const [args] = prisma.fieldDefinition.createMany.mock.calls[0];
    provisioned = Array.isArray(args?.data) ? args.data : [];
  });

  it('gives the organization the lead system fields in order', () => {
    expect(provisioned.map((field) => field.key)).toEqual([
      'candidate',
      'product',
      'source',
      'signal',
      'whyLead',
      'status',
      'receivedAt',
    ]);
    expect(provisioned.map((field) => field.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    for (const field of provisioned) {
      expect(field).toEqual(
        expect.objectContaining({
          organizationId: 'organization-a',
          collection: FieldCollection.lead,
          isSystem: true,
        }),
      );
    }
  });

  it('labels the fields the way a person reads them', () => {
    expect(provisioned.map((field) => field.label)).toEqual([
      'Contact',
      'Product',
      'Source',
      'What they said',
      'Why this is a lead',
      'Status',
      'Received',
    ]);
  });

  it('makes product a select field', () => {
    expect(provisioned.find((field) => field.key === 'product')).toEqual(
      expect.objectContaining({
        type: FieldType.select,
        options: ['POS', 'PMS', 'Other'],
        isRequired: true,
      }),
    );
  });

  it('keeps status and receivedAt out of reach of lead values', () => {
    const readOnly = provisioned.filter((field) => field.isReadOnly);

    expect(readOnly.map((field) => field.key)).toEqual([
      'status',
      'receivedAt',
    ]);
    expect(readOnly[0].options).toEqual([...LEAD_STATUSES]);
    expect(readOnly.some((field) => field.isRequired)).toBe(false);
  });
});
