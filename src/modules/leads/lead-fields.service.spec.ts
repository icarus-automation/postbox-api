import { BadRequestException, ConflictException } from '@nestjs/common';
import { FieldCollection, FieldType, Prisma } from '@prisma/client';
import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { LeadFieldsService } from './lead-fields.service';
import type { LeadField } from './types/leads.types';

// The service selects a subset of the model, so fixtures are deliberately
// narrower than the row the typed mock expects back.
type FoundField = Awaited<
  ReturnType<PrismaService['fieldDefinition']['findFirst']>
>;

const statusField: LeadField = {
  id: 'field-status',
  key: 'status',
  label: 'Status',
  type: FieldType.select,
  options: ['new', 'contacted', 'qualified'],
  isRequired: false,
  isReadOnly: true,
  isSystem: true,
  position: 6,
};

const dealSizeField: LeadField = {
  id: 'field-deal-size',
  key: 'dealSize',
  label: 'Deal size',
  type: FieldType.number,
  options: [],
  isRequired: false,
  isReadOnly: false,
  isSystem: false,
  position: 8,
};

function found(field: LeadField | { position: number } | null): FoundField {
  return field as FoundField;
}

// The shape Prisma 7 reports a unique violation in when it comes through the
// pg driver adapter.
function uniqueViolation(index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            kind: 'UniqueConstraintViolation',
            constraint: { index },
          },
        },
        modelName: 'FieldDefinition',
      },
    },
  );
}

describe('LeadFieldsService', () => {
  const prisma = mockDeep<PrismaService>();
  const service = new LeadFieldsService(prisma);

  const { findMany, findFirst, create, update } = prisma.fieldDefinition;
  const remove = prisma.fieldDefinition.delete;

  beforeEach(() => {
    mockReset(prisma);
  });

  it('lists the lead fields of one organization in position order', async () => {
    findMany.mockResolvedValue([statusField as never]);

    await expect(service.getAllLeadFields('organization-a')).resolves.toEqual([
      statusField,
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          collection: FieldCollection.lead,
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  });

  it('appends a custom field after the last position', async () => {
    findFirst.mockResolvedValue(found({ position: 7 }));
    create.mockResolvedValue(dealSizeField as never);

    await service.createLeadField('organization-a', {
      key: 'dealSize',
      label: 'Deal size',
      type: FieldType.number,
    });

    // One query, for the next position. The key is left to the database.
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'organization-a',
          collection: FieldCollection.lead,
          key: 'dealSize',
          label: 'Deal size',
          type: FieldType.number,
          options: [],
          isRequired: false,
          position: 8,
        },
      }),
    );
  });

  it('turns the database key conflict into 409 without a preflight read', async () => {
    findFirst.mockResolvedValue(found({ position: 6 }));
    create.mockRejectedValue(
      uniqueViolation('field_definitions_organization_id_collection_key_key'),
    );

    await expect(
      service.createLeadField('organization-a', {
        key: 'status',
        label: 'Stage',
        type: FieldType.text,
      }),
    ).rejects.toThrow(
      new ConflictException('Lead field status already exists'),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('leaves an unrelated Prisma error alone', async () => {
    findFirst.mockResolvedValue(found({ position: 6 }));
    create.mockRejectedValue(uniqueViolation('some_other_unique_index'));

    await expect(
      service.createLeadField('organization-a', {
        key: 'dealSize',
        label: 'Deal size',
        type: FieldType.number,
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('scopes the key to one organization and collection', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue(dealSizeField as never);

    await service.createLeadField('organization-b', {
      key: 'dealSize',
      label: 'Deal size',
      type: FieldType.number,
    });

    // The same key in another organization or collection is a different row,
    // which is why the unique constraint carries all three columns.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'organization-b',
          collection: FieldCollection.lead,
          key: 'dealSize',
          position: 0,
        }) as unknown,
      }),
    );
  });

  it('requires options on select fields and refuses them on other types', async () => {
    await expect(
      service.createLeadField('organization-a', {
        key: 'tier',
        label: 'Tier',
        type: FieldType.select,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createLeadField('organization-a', {
        key: 'notes',
        label: 'Notes',
        type: FieldType.long_text,
        options: ['a'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('only lets a read-only field change its label and position', async () => {
    findFirst.mockResolvedValue(found(statusField));
    update.mockResolvedValue({ ...statusField, label: 'Stage' } as never);

    await expect(
      service.updateLeadField('organization-a', 'field-status', {
        options: ['new', 'won'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateLeadField('organization-a', 'field-status', {
        isRequired: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();

    await service.updateLeadField('organization-a', 'field-status', {
      label: 'Stage',
      position: 0,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'field-status' },
        data: {
          label: 'Stage',
          isRequired: undefined,
          options: undefined,
          position: 0,
        },
      }),
    );
  });

  it('archives a removed option without touching the leads that hold it', async () => {
    const productField: LeadField = {
      ...dealSizeField,
      id: 'field-product',
      key: 'product',
      type: FieldType.select,
      options: ['POS', 'PMS', 'Other'],
      isSystem: true,
    };
    findFirst.mockResolvedValue(found(productField));
    update.mockResolvedValue({
      ...productField,
      options: ['PMS', 'Other'],
    } as never);

    await expect(
      service.updateLeadField('organization-a', 'field-product', {
        options: ['PMS', 'Other'],
      }),
    ).resolves.toEqual(expect.objectContaining({ options: ['PMS', 'Other'] }));

    expect(update).toHaveBeenCalledTimes(1);
    expect(prisma.leadValue.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses options on a field that is not a select', async () => {
    findFirst.mockResolvedValue(found(dealSizeField));

    await expect(
      service.updateLeadField('organization-a', 'field-deal-size', {
        options: ['small', 'large'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('cannot change or delete a field through another organization', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.updateLeadField('organization-b', 'field-deal-size', {
        label: 'Budget',
      }),
    ).resolves.toBeNull();
    await expect(
      service.deleteLeadField('organization-b', 'field-deal-size'),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'field-deal-size',
          organizationId: 'organization-b',
          collection: FieldCollection.lead,
        },
      }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a system field', async () => {
    findFirst.mockResolvedValue(found(statusField));

    await expect(
      service.deleteLeadField('organization-a', 'field-status'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes a custom field', async () => {
    findFirst.mockResolvedValue(found(dealSizeField));
    remove.mockResolvedValue(dealSizeField as never);

    await expect(
      service.deleteLeadField('organization-a', 'field-deal-size'),
    ).resolves.toEqual(dealSizeField);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'field-deal-size' } }),
    );
  });
});
