import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldCollection, FieldType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { LeadFieldsService } from './lead-fields.service';
import type { LeadField } from './types/leads.types';

type FieldQuery = {
  where: {
    id?: string;
    key?: string;
    organizationId: string;
    collection: FieldCollection;
  };
};

const statusField: LeadField = {
  id: 'field-status',
  key: 'status',
  label: 'Status',
  type: FieldType.select,
  options: ['new', 'contacted', 'qualified', 'archived'],
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

describe('LeadFieldsService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();

  let service: LeadFieldsService;

  beforeEach(async () => {
    findMany.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    remove.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadFieldsService,
        {
          provide: PrismaService,
          useValue: {
            fieldDefinition: {
              findMany,
              findFirst,
              create,
              update,
              delete: remove,
            },
          },
        },
      ],
    }).compile();

    service = module.get(LeadFieldsService);
  });

  it('lists the lead fields of one organization in position order', async () => {
    findMany.mockResolvedValue([statusField]);

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
    findFirst.mockImplementation(({ where }: FieldQuery) =>
      Promise.resolve(where.key ? null : { position: 7 }),
    );
    create.mockResolvedValue(dealSizeField);

    await service.createLeadField('organization-a', {
      key: 'dealSize',
      label: 'Deal size',
      type: FieldType.number,
    });

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

  it('refuses a key the organization already uses', async () => {
    findFirst.mockResolvedValue({ id: 'field-status', position: 6 });

    await expect(
      service.createLeadField('organization-a', {
        key: 'status',
        label: 'Stage',
        type: FieldType.text,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
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
    findFirst.mockResolvedValue(statusField);
    update.mockResolvedValue({ ...statusField, label: 'Stage' });

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
    findFirst.mockResolvedValue(productField);
    update.mockResolvedValue({ ...productField, options: ['PMS', 'Other'] });

    await expect(
      service.updateLeadField('organization-a', 'field-product', {
        options: ['PMS', 'Other'],
      }),
    ).resolves.toEqual(expect.objectContaining({ options: ['PMS', 'Other'] }));

    // The service only holds fieldDefinition, so writing a lead value would throw.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('refuses options on a field that is not a select', async () => {
    findFirst.mockResolvedValue(dealSizeField);

    await expect(
      service.updateLeadField('organization-a', 'field-deal-size', {
        options: ['small', 'large'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('cannot change or delete a field through another organization', async () => {
    findFirst.mockImplementation(({ where }: FieldQuery) =>
      Promise.resolve(
        where.organizationId === 'organization-a' ? dealSizeField : null,
      ),
    );

    await expect(
      service.updateLeadField('organization-b', 'field-deal-size', {
        label: 'Budget',
      }),
    ).resolves.toBeNull();
    await expect(
      service.deleteLeadField('organization-b', 'field-deal-size'),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to delete a system field', async () => {
    findFirst.mockResolvedValue(statusField);

    await expect(
      service.deleteLeadField('organization-a', 'field-status'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes a custom field', async () => {
    findFirst.mockResolvedValue(dealSizeField);
    remove.mockResolvedValue(dealSizeField);

    await expect(
      service.deleteLeadField('organization-a', 'field-deal-size'),
    ).resolves.toEqual(dealSizeField);
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'field-deal-size' } }),
    );
  });
});
