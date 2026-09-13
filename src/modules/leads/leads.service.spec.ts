import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { LeadFieldsService } from './lead-fields.service';
import { LeadsService } from './leads.service';
import type { LeadField } from './types/leads.types';

type ScopedLeadQuery = {
  where: {
    id: string;
    organizationId: string;
  };
};

function leadField(
  key: string,
  type: FieldType,
  overrides: Partial<LeadField> = {},
): LeadField {
  return {
    id: `field-${key}`,
    key,
    label: key,
    type,
    options: [],
    isRequired: false,
    isReadOnly: false,
    isSystem: true,
    position: 0,
    ...overrides,
  };
}

const fields: LeadField[] = [
  leadField('candidate', FieldType.text, { isRequired: true }),
  leadField('product', FieldType.select, {
    isRequired: true,
    options: ['POS', 'PMS', 'Other'],
  }),
  leadField('source', FieldType.url),
  leadField('draftOpener', FieldType.long_text),
  leadField('status', FieldType.select, {
    isReadOnly: true,
    options: ['new', 'contacted', 'qualified', 'archived'],
  }),
  leadField('receivedAt', FieldType.datetime, { isReadOnly: true }),
  leadField('dealSize', FieldType.number, { isSystem: false }),
];

const createdAt = new Date('2026-09-13T10:00:00.000Z');
const updatedAt = new Date('2026-09-13T11:00:00.000Z');

function storedLead(values: { fieldId: string; value: string | number }[]) {
  return { id: 'lead-a', createdAt, updatedAt, values };
}

describe('LeadsService', () => {
  const create = jest.fn();
  const count = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const getAllLeadFields = jest.fn<LeadFieldsService['getAllLeadFields']>();

  let service: LeadsService;

  beforeEach(async () => {
    create.mockReset();
    count.mockReset();
    findMany.mockReset();
    findFirst.mockReset();
    update.mockReset();
    getAllLeadFields.mockReset();
    getAllLeadFields.mockResolvedValue(fields);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        {
          provide: PrismaService,
          useValue: { lead: { create, count, findMany, findFirst, update } },
        },
        { provide: LeadFieldsService, useValue: { getAllLeadFields } },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  it('stores the given values and the initial status under the calling organization', async () => {
    create.mockResolvedValue(
      storedLead([
        { fieldId: 'field-candidate', value: 'Dana Reyes' },
        { fieldId: 'field-product', value: 'POS' },
        { fieldId: 'field-status', value: 'new' },
      ]),
    );

    await service.createLead('organization-a', {
      values: { candidate: 'Dana Reyes', product: 'POS' },
    });

    expect(getAllLeadFields).toHaveBeenCalledWith('organization-a');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'organization-a',
          values: {
            create: [
              { fieldId: 'field-candidate', value: 'Dana Reyes' },
              { fieldId: 'field-product', value: 'POS' },
              { fieldId: 'field-status', value: 'new' },
            ],
          },
        },
      }),
    );
  });

  it('writes nothing when the values do not fit the fields', async () => {
    await expect(
      service.createLead('organization-a', {
        values: { candidate: 'Dana Reyes', product: 'POS', budget: 5000 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns every field key in field order, with receivedAt from the lead row', async () => {
    findFirst.mockResolvedValue(
      storedLead([
        { fieldId: 'field-status', value: 'contacted' },
        { fieldId: 'field-candidate', value: 'Dana Reyes' },
      ]),
    );

    await expect(service.getLead('organization-a', 'lead-a')).resolves.toEqual(
      {
        id: 'lead-a',
        values: {
          candidate: 'Dana Reyes',
          product: null,
          source: null,
          draftOpener: null,
          status: 'contacted',
          receivedAt: '2026-09-13T10:00:00.000Z',
          dealSize: null,
        },
        createdAt,
        updatedAt,
      },
    );
  });

  it('scopes listings to the active organization and paginates', async () => {
    count.mockResolvedValue(3);
    findMany.mockResolvedValue([storedLead([])]);

    const result = await service.getAllLeads('organization-a', {
      page: 2,
      limit: 2,
    });

    expect(result.data.map((lead) => lead.id)).toEqual(['lead-a']);
    expect(result.meta).toEqual({ total: 3, page: 2, limit: 2, lastPage: 2 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a' },
        skip: 2,
        take: 2,
      }),
    );
  });

  it('filters listings by status and an exact field value together', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      status: 'contacted',
      field: 'source',
      value: 'https://example.com/groups/indie/posts/1',
    });

    const where = {
      organizationId: 'organization-a',
      AND: [
        {
          values: {
            some: { fieldId: 'field-status', value: { equals: 'contacted' } },
          },
        },
        {
          values: {
            some: {
              fieldId: 'field-source',
              value: { equals: 'https://example.com/groups/indie/posts/1' },
            },
          },
        },
      ],
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
  });

  it('matches a number field lookup against the stored number', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      field: 'dealSize',
      value: '1200',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          AND: [
            {
              values: {
                some: { fieldId: 'field-dealSize', value: { equals: 1200 } },
              },
            },
          ],
        },
      }),
    );
  });

  it('refuses a lookup on a field the organization does not have', async () => {
    await expect(
      service.getAllLeads('organization-a', {
        page: 1,
        limit: 10,
        field: 'externalId',
        value: 'fb-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('cannot get a lead through another organization', async () => {
    findFirst.mockImplementation(({ where }: ScopedLeadQuery) =>
      Promise.resolve(
        where.id === 'lead-a' && where.organizationId === 'organization-a'
          ? storedLead([])
          : null,
      ),
    );

    await expect(
      service.getLead('organization-a', 'lead-a'),
    ).resolves.toEqual(expect.objectContaining({ id: 'lead-a' }));
    await expect(
      service.getLead('organization-b', 'lead-a'),
    ).resolves.toBeNull();
  });

  it('upserts the given values and deletes the cleared ones', async () => {
    findFirst.mockResolvedValue({ id: 'lead-a' });
    update.mockResolvedValue(storedLead([]));

    await service.updateLeadValues('organization-a', 'lead-a', {
      values: { candidate: 'Dana R.', draftOpener: null },
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a', organizationId: 'organization-a' },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a' },
        data: {
          updatedAt: expect.any(Date) as Date,
          values: {
            upsert: [
              {
                where: {
                  leadId_fieldId: {
                    leadId: 'lead-a',
                    fieldId: 'field-candidate',
                  },
                },
                create: { fieldId: 'field-candidate', value: 'Dana R.' },
                update: { value: 'Dana R.' },
              },
            ],
            deleteMany: { fieldId: { in: ['field-draftOpener'] } },
          },
        },
      }),
    );
  });

  it('never lets a values update change the status', async () => {
    findFirst.mockResolvedValue({ id: 'lead-a' });

    await expect(
      service.updateLeadValues('organization-a', 'lead-a', {
        values: { status: 'qualified' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('moves a lead in the active organization to the requested status', async () => {
    findFirst.mockResolvedValue({ id: 'lead-a' });
    update.mockResolvedValue(
      storedLead([{ fieldId: 'field-status', value: 'qualified' }]),
    );

    const lead = await service.setLeadStatus(
      'organization-a',
      'lead-a',
      'qualified',
    );

    expect(lead?.values.status).toBe('qualified');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a' },
        data: expect.objectContaining({
          values: {
            upsert: [
              {
                where: {
                  leadId_fieldId: { leadId: 'lead-a', fieldId: 'field-status' },
                },
                create: { fieldId: 'field-status', value: 'qualified' },
                update: { value: 'qualified' },
              },
            ],
            deleteMany: { fieldId: { in: [] } },
          },
        }) as object,
      }),
    );
  });

  it('cannot change a lead through another organization', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.setLeadStatus('organization-b', 'lead-a', 'archived'),
    ).resolves.toBeNull();
    await expect(
      service.updateLeadValues('organization-b', 'lead-a', {
        values: { candidate: 'Dana R.' },
      }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
