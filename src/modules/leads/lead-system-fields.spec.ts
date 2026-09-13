import { FieldCollection, FieldType } from '@prisma/client';

import type { PrismaService } from '../../core/database/prisma.service';
import {
  LEAD_STATUSES,
  provisionLeadSystemFields,
} from './lead-system-fields';

type ProvisionedField = {
  organizationId: string;
  collection: FieldCollection;
  key: string;
  type: FieldType;
  options?: string[];
  isRequired?: boolean;
  isReadOnly?: boolean;
  isSystem: boolean;
  position: number;
};

describe('provisionLeadSystemFields', () => {
  const createMany = jest.fn();
  const db = { fieldDefinition: { createMany } } as unknown as PrismaService;

  let provisioned: ProvisionedField[];

  beforeAll(async () => {
    createMany.mockImplementation(({ data }: { data: ProvisionedField[] }) => {
      provisioned = data;
      return Promise.resolve({ count: data.length });
    });

    await provisionLeadSystemFields(db, 'organization-a');
  });

  it('gives the organization the lead system fields in order', () => {
    expect(provisioned.map((field) => field.key)).toEqual([
      'candidate',
      'product',
      'source',
      'signal',
      'whyLead',
      'draftOpener',
      'status',
      'receivedAt',
    ]);
    expect(provisioned.map((field) => field.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
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
