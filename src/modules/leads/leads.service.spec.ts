import { BadRequestException } from '@nestjs/common';
import { FieldType, LeadChannel, type Prisma } from '@prisma/client';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { LeadFieldsService } from './lead-fields.service';
import { LeadsService } from './leads.service';
import type { LeadField } from './types/leads.types';

// The service selects a subset of the model, so fixtures are narrower than the
// row the typed mock expects back.
type StoredLead = NonNullable<
  Awaited<ReturnType<PrismaService['lead']['findFirst']>>
>;

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
  leadField('note', FieldType.long_text),
  leadField('whyLead', FieldType.long_text),
  leadField('email', FieldType.text),
  leadField('phone', FieldType.text),
  leadField('status', FieldType.select, {
    isReadOnly: true,
    options: ['new', 'contacted', 'qualified'],
  }),
  leadField('receivedAt', FieldType.datetime, { isReadOnly: true }),
  leadField('dealSize', FieldType.number, { isSystem: false }),
];

const createdAt = new Date('2026-09-13T10:00:00.000Z');
const updatedAt = new Date('2026-09-13T11:00:00.000Z');

type StoredSubmission = {
  id: string;
  channel: LeadChannel;
  values: Record<string, string | number>;
  createdAt: Date;
};

// The typed mock is declared to return a bare Lead, while the service reads one
// with its values joined in, so the fixture is cast to the call's real shape.
function storedLead(
  values: { fieldId: string; value: string | number }[],
  isArchived = false,
  channel: LeadChannel = LeadChannel.form,
  submissions: StoredSubmission[] = [],
): StoredLead {
  return {
    id: 'lead-a',
    channel,
    isArchived,
    createdAt,
    updatedAt,
    values,
    submissions,
  } as unknown as StoredLead;
}

// What the scoping lookup reads before a write: the id and the channel.
function existingLead(channel: LeadChannel = LeadChannel.form): StoredLead {
  return { id: 'lead-a', channel } as StoredLead;
}

// The bound values of the contact conditions in the dedupe query.
function contactValues(call: unknown[]): unknown[] {
  return (call[2] as Prisma.Sql).values;
}

describe('LeadsService', () => {
  const prisma = mockDeep<PrismaService>();
  const leadFieldsService = mock<LeadFieldsService>();
  const service = new LeadsService(prisma, leadFieldsService);

  const { create, count, findMany, findFirst, update } = prisma.lead;
  const queryRaw = prisma.$queryRaw;
  const getAllLeadFields = leadFieldsService.getAllLeadFields;

  beforeEach(() => {
    mockReset(prisma);
    mockReset(leadFieldsService);
    getAllLeadFields.mockResolvedValue(fields);
    queryRaw.mockResolvedValue([]);
  });

  it('stores the given values and the initial status under the calling organization', async () => {
    create.mockResolvedValue(
      storedLead([
        { fieldId: 'field-candidate', value: 'Dana Reyes' },
        { fieldId: 'field-product', value: 'POS' },
        { fieldId: 'field-status', value: 'new' },
      ]),
    );

    await service.createLead('organization-a', LeadChannel.form, {
      values: { candidate: 'Dana Reyes', product: 'POS' },
    });

    expect(getAllLeadFields).toHaveBeenCalledWith('organization-a');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'organization-a',
          channel: LeadChannel.form,
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
      service.createLead('organization-a', LeadChannel.form, {
        values: { candidate: 'Dana Reyes', product: 'POS', budget: 5000 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('files an agent lead with its reason under the agent channel', async () => {
    create.mockResolvedValue(storedLead([], false, LeadChannel.agent));

    const lead = await service.createLead('organization-a', LeadChannel.agent, {
      values: {
        candidate: 'Dana Reyes',
        product: 'POS',
        whyLead: 'Asked for a POS in a group post.',
      },
    });

    expect(lead.channel).toBe(LeadChannel.agent);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: LeadChannel.agent,
          values: {
            create: expect.arrayContaining([
              {
                fieldId: 'field-whyLead',
                value: 'Asked for a POS in a group post.',
              },
            ]) as unknown,
          },
        }) as object,
      }),
    );
  });

  it('refuses an agent lead without a reason before looking for a repeat', async () => {
    await expect(
      service.createLead('organization-a', LeadChannel.agent, {
        values: { candidate: 'Dana Reyes', product: 'POS', email: 'd@x.co' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('looks for a repeat only when an email or phone is given', async () => {
    create.mockResolvedValue(storedLead([]));

    await service.createLead('organization-a', LeadChannel.form, {
      values: { candidate: 'Dana Reyes', product: 'POS', phone: 'n/a' },
    });

    expect(queryRaw).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });

  it('matches a repeat on the email in any case and the phone digits alone', async () => {
    create.mockResolvedValue(storedLead([]));

    await service.createLead('organization-a', LeadChannel.form, {
      values: {
        candidate: 'Dana Reyes',
        product: 'POS',
        email: '  Dana@Example.com ',
        phone: '+63 (917) 123-4567',
      },
    });

    const [call] = queryRaw.mock.calls;
    expect(call[1]).toBe('organization-a');
    expect(contactValues(call)).toEqual([
      'field-email',
      'dana@example.com',
      'field-phone',
      '639171234567',
    ]);
    expect(create).toHaveBeenCalled();
  });

  it('attaches a repeat to the lead it matches instead of filing a new one', async () => {
    queryRaw.mockResolvedValue([{ id: 'lead-a', channel: LeadChannel.form }]);
    update.mockResolvedValue(
      storedLead([], false, LeadChannel.form, [
        {
          id: 'submission-a',
          channel: LeadChannel.form,
          values: { email: 'dana@example.com', signal: 'Still keen' },
          createdAt: updatedAt,
        },
      ]),
    );

    const lead = await service.createLead('organization-a', LeadChannel.form, {
      values: {
        candidate: 'Dana Reyes',
        product: 'POS',
        email: 'dana@example.com',
        note: 'Still keen',
      },
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a' },
        data: {
          updatedAt: expect.any(Date) as Date,
          // Filled only where the lead has no value yet, and never the status.
          values: {
            createMany: {
              data: [
                { fieldId: 'field-candidate', value: 'Dana Reyes' },
                { fieldId: 'field-product', value: 'POS' },
                { fieldId: 'field-email', value: 'dana@example.com' },
                { fieldId: 'field-note', value: 'Still keen' },
              ],
              skipDuplicates: true,
            },
          },
          submissions: {
            create: {
              channel: LeadChannel.form,
              values: {
                candidate: 'Dana Reyes',
                product: 'POS',
                email: 'dana@example.com',
                note: 'Still keen',
              },
            },
          },
        },
      }),
    );
    expect(lead.submissions).toEqual([
      {
        id: 'submission-a',
        channel: LeadChannel.form,
        values: { email: 'dana@example.com', signal: 'Still keen' },
        createdAt: updatedAt,
      },
    ]);
    expect(lead.nowInbound).toBe(false);
  });

  it('flags an agent lead as now inbound once its person sends the form', async () => {
    queryRaw.mockResolvedValue([{ id: 'lead-a', channel: LeadChannel.agent }]);
    update.mockResolvedValue(
      storedLead([], false, LeadChannel.agent, [
        {
          id: 'submission-a',
          channel: LeadChannel.form,
          values: { email: 'dana@example.com' },
          createdAt: updatedAt,
        },
      ]),
    );

    const lead = await service.createLead('organization-a', LeadChannel.form, {
      values: { candidate: 'Dana Reyes', product: 'POS', email: 'dana@example.com' },
    });

    expect(lead.channel).toBe(LeadChannel.agent);
    expect(lead.nowInbound).toBe(true);
  });

  it('never gives a form lead the reason from an agent repeat', async () => {
    queryRaw.mockResolvedValue([{ id: 'lead-a', channel: LeadChannel.form }]);
    update.mockResolvedValue(storedLead([]));

    await service.createLead('organization-a', LeadChannel.agent, {
      values: {
        candidate: 'Dana Reyes',
        product: 'POS',
        phone: '0917 123 4567',
        whyLead: 'Posted about a second cafe.',
      },
    });

    const data = update.mock.calls[0][0].data as {
      values: { createMany: { data: { fieldId: string }[] } };
      submissions: { create: { values: Record<string, unknown> } };
    };
    expect(data.values.createMany.data.map(({ fieldId }) => fieldId)).not.toContain(
      'field-whyLead',
    );
    expect(data.submissions.create.values['whyLead']).toBe(
      'Posted about a second cafe.',
    );
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
        channel: LeadChannel.form,
        nowInbound: false,
        values: {
          candidate: 'Dana Reyes',
          product: null,
          source: null,
          note: null,
          whyLead: null,
          email: null,
          phone: null,
          status: 'contacted',
          receivedAt: '2026-09-13T10:00:00.000Z',
          dealSize: null,
        },
        submissions: [],
        isArchived: false,
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
      archived: false,
    });

    expect(result.data.map((lead) => lead.id)).toEqual(['lead-a']);
    expect(result.meta).toEqual({ total: 3, page: 2, limit: 2, lastPage: 2 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', isArchived: false },
        skip: 2,
        take: 2,
      }),
    );
  });

  it('lists the archive on its own, never mixed into the inbox', async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([storedLead([], true)]);

    const result = await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      archived: true,
    });

    expect(result.data[0].isArchived).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', isArchived: true },
      }),
    );
  });

  it('lists inbound leads with the agent leads that sent the form since', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      archived: false,
      channel: LeadChannel.form,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
          OR: [
            { channel: LeadChannel.form },
            { submissions: { some: { channel: LeadChannel.form } } },
          ],
        },
      }),
    );
  });

  it('lists prospects as every lead an agent found', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      archived: false,
      channel: LeadChannel.agent,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
          channel: LeadChannel.agent,
        },
      }),
    );
  });

  it('filters listings by status and an exact field value together', async () => {
    count.mockResolvedValue(0);
    findMany.mockResolvedValue([]);

    await service.getAllLeads('organization-a', {
      page: 1,
      limit: 10,
      archived: false,
      status: 'contacted',
      field: 'source',
      value: 'https://example.com/groups/indie/posts/1',
    });

    const where = {
      organizationId: 'organization-a',
      isArchived: false,
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
      archived: false,
      field: 'dealSize',
      value: '1200',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
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
        archived: false,
        field: 'externalId',
        value: 'fb-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('cannot get a lead through another organization', async () => {
    findFirst.mockResolvedValueOnce(storedLead([]));
    await expect(
      service.getLead('organization-a', 'lead-a'),
    ).resolves.toEqual(expect.objectContaining({ id: 'lead-a' }));

    findFirst.mockResolvedValueOnce(null);
    await expect(
      service.getLead('organization-b', 'lead-a'),
    ).resolves.toBeNull();

    // Every read carries the organization, so a lead in another one is simply
    // not there rather than hidden after the fact.
    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'lead-a', organizationId: 'organization-a' },
      }),
    );
    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'lead-a', organizationId: 'organization-b' },
      }),
    );
  });

  it('upserts the given values and deletes the cleared ones', async () => {
    findFirst.mockResolvedValue(existingLead());
    update.mockResolvedValue(storedLead([]));

    await service.updateLeadValues('organization-a', 'lead-a', {
      values: { candidate: 'Dana R.', note: null },
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
            deleteMany: { fieldId: { in: ['field-note'] } },
          },
        },
      }),
    );
  });

  it('refuses a reason typed onto a form lead', async () => {
    findFirst.mockResolvedValue(existingLead(LeadChannel.form));

    await expect(
      service.updateLeadValues('organization-a', 'lead-a', {
        values: { whyLead: 'Looks keen' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('edits the reason on an agent lead', async () => {
    findFirst.mockResolvedValue(existingLead(LeadChannel.agent));
    update.mockResolvedValue(storedLead([], false, LeadChannel.agent));

    await service.updateLeadValues('organization-a', 'lead-a', {
      values: { whyLead: 'Opening a second cafe.' },
    });

    expect(update).toHaveBeenCalled();
  });

  it('never lets a values update change the status', async () => {
    findFirst.mockResolvedValue(existingLead());

    await expect(
      service.updateLeadValues('organization-a', 'lead-a', {
        values: { status: 'qualified' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('moves a lead in the active organization to the requested status', async () => {
    findFirst.mockResolvedValue(existingLead());
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

  it('archives a lead without touching the status it reached', async () => {
    findFirst.mockResolvedValue(existingLead());
    update.mockResolvedValue(
      storedLead([{ fieldId: 'field-status', value: 'contacted' }], true),
    );

    const lead = await service.setLeadArchived(
      'organization-a',
      'lead-a',
      true,
    );

    expect(lead?.isArchived).toBe(true);
    expect(lead?.values.status).toBe('contacted');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a' },
        data: { isArchived: true },
      }),
    );
  });

  it('restores a lead out of the archive', async () => {
    findFirst.mockResolvedValue(existingLead());
    update.mockResolvedValue(storedLead([]));

    const lead = await service.setLeadArchived(
      'organization-a',
      'lead-a',
      false,
    );

    expect(lead?.isArchived).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isArchived: false } }),
    );
  });

  it('cannot change a lead through another organization', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.setLeadStatus('organization-b', 'lead-a', 'qualified'),
    ).resolves.toBeNull();
    await expect(
      service.setLeadArchived('organization-b', 'lead-a', true),
    ).resolves.toBeNull();
    await expect(
      service.updateLeadValues('organization-b', 'lead-a', {
        values: { candidate: 'Dana R.' },
      }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
