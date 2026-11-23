import { BadRequestException } from '@nestjs/common';
import { FieldType, LeadChannel } from '@prisma/client';

import { parseLeadLookup, parseLeadValues } from './lead-values';
import type { LeadField } from './types/leads.types';

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
    isSystem: false,
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
  leadField('source', FieldType.url, { isRequired: true }),
  leadField('note', FieldType.long_text),
  leadField('status', FieldType.select, {
    isReadOnly: true,
    options: ['new', 'contacted'],
  }),
  leadField('dealSize', FieldType.number),
  leadField('followUpOn', FieldType.date),
];

const complete = {
  candidate: 'Dana Reyes',
  product: 'POS',
  source: 'https://example.com/groups/indie/posts/1',
};

function errorsFor(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
  channel: LeadChannel = LeadChannel.form,
  against: LeadField[] = fields,
): string[] {
  try {
    parseLeadValues(against, input, mode, channel);
    return [];
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: string[] }).message;
  }
}

describe('parseLeadValues', () => {
  it('sets every given value on create', () => {
    const changes = parseLeadValues(
      fields,
      { ...complete, dealSize: 1200.5, followUpOn: '2026-09-30' },
      'create',
      LeadChannel.form,
    );

    expect(changes.clear).toEqual([]);
    expect(
      changes.set.map(({ field, value }) => [field.key, value]),
    ).toEqual([
      ['candidate', 'Dana Reyes'],
      ['product', 'POS'],
      ['source', 'https://example.com/groups/indie/posts/1'],
      ['dealSize', 1200.5],
      ['followUpOn', '2026-09-30'],
    ]);
  });

  it('refuses keys that are not lead fields, by name', () => {
    expect(errorsFor({ ...complete, budget: 5000 }, 'create')).toEqual([
      'values.budget is not a lead field',
    ]);
  });

  it('refuses read-only keys on create and update', () => {
    expect(errorsFor({ ...complete, status: 'contacted' }, 'create')).toEqual([
      'values.status is read-only',
    ]);
    expect(errorsFor({ status: 'contacted' }, 'update')).toEqual([
      'values.status is read-only',
    ]);
  });

  it('requires every required field on create', () => {
    expect(errorsFor({ product: null }, 'create')).toEqual([
      'values.product is required',
      'values.candidate is required',
      'values.source is required',
    ]);
  });

  it('only checks the given keys on update', () => {
    expect(errorsFor({ note: 'Saw your post' }, 'update')).toEqual([]);
  });

  it('ignores null on create and clears on update', () => {
    expect(
      parseLeadValues(
        fields,
        { ...complete, note: null },
        'create',
        LeadChannel.form,
      ).clear,
    ).toEqual([]);

    const changes = parseLeadValues(
      fields,
      { note: null },
      'update',
      LeadChannel.form,
    );
    expect(changes.set).toEqual([]);
    expect(changes.clear.map((field) => field.key)).toEqual(['note']);
  });

  it('refuses to clear a required field', () => {
    expect(errorsFor({ candidate: null }, 'update')).toEqual([
      'values.candidate is required',
    ]);
  });

  it('checks each value against its field type', () => {
    expect(
      errorsFor(
        {
          candidate: '   ',
          product: 'CRM',
          source: 'ftp://example.com/file',
          note: 'x'.repeat(5001),
          dealSize: '1200',
          followUpOn: '2026-02-30',
        },
        'update',
      ),
    ).toEqual([
      'values.candidate must be non-blank text of at most 500 characters',
      'values.product must be one of: POS, PMS, Other',
      'values.source must be an http or https URL of at most 2048 characters',
      'values.note must be non-blank text of at most 5000 characters',
      'values.dealSize must be a number',
      'values.followUpOn must be a date formatted YYYY-MM-DD',
    ]);
  });
});

describe('parseLeadValues whyLead by channel', () => {
  // Marked required on purpose: the channel decides, whatever the definition says.
  const withReason = [
    ...fields,
    leadField('whyLead', FieldType.long_text, {
      isSystem: true,
      isRequired: true,
    }),
  ];
  const agentRequired =
    'values.whyLead is required on agent leads, which an admin API key files';

  it('refuses an agent lead without a reason, in one clear message', () => {
    expect(
      errorsFor(complete, 'create', LeadChannel.agent, withReason),
    ).toEqual([agentRequired]);
    expect(
      errorsFor(
        { ...complete, whyLead: null },
        'create',
        LeadChannel.agent,
        withReason,
      ),
    ).toEqual([agentRequired]);
  });

  it('keeps the reason on an agent lead and never lets it be cleared', () => {
    const changes = parseLeadValues(
      withReason,
      { ...complete, whyLead: 'Asked for a POS this week.' },
      'create',
      LeadChannel.agent,
    );

    expect(changes.set.map(({ field }) => field.key)).toContain('whyLead');
    expect(
      errorsFor({ whyLead: null }, 'update', LeadChannel.agent, withReason),
    ).toEqual([agentRequired]);
  });

  it('drops a reason a website still sends on a form lead', () => {
    const changes = parseLeadValues(
      withReason,
      { ...complete, whyLead: 'Contact form on https://acme.example' },
      'create',
      LeadChannel.form,
    );

    expect(changes.set.map(({ field }) => field.key)).toEqual([
      'candidate',
      'product',
      'source',
    ]);
    expect(errorsFor(complete, 'create', LeadChannel.form, withReason)).toEqual(
      [],
    );
  });

  it('refuses a reason typed onto a form lead, but lets one be cleared', () => {
    expect(
      errorsFor(
        { whyLead: 'Looks keen' },
        'update',
        LeadChannel.form,
        withReason,
      ),
    ).toEqual(['values.whyLead is only kept on agent leads']);

    const changes = parseLeadValues(
      withReason,
      { whyLead: null },
      'update',
      LeadChannel.form,
    );
    expect(changes.clear.map((field) => field.key)).toEqual(['whyLead']);
  });
});

describe('parseLeadLookup', () => {
  function lookupError(key: string, value: string): string[] {
    try {
      parseLeadLookup(fields, key, value);
      return [];
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      return (error.getResponse() as { message: string[] }).message;
    }
  }

  it('matches text-like fields by the exact string', () => {
    const lookup = parseLeadLookup(fields, 'source', 'https://example.com/a');

    expect(lookup.field.key).toBe('source');
    expect(lookup.value).toBe('https://example.com/a');
  });

  it('still finds a select value that is no longer an option', () => {
    expect(parseLeadLookup(fields, 'product', 'CRM').value).toBe('CRM');
  });

  it('reads number fields as numbers', () => {
    expect(parseLeadLookup(fields, 'dealSize', '1200.50').value).toBe(1200.5);
    expect(lookupError('dealSize', 'lots')).toEqual([
      'value must be a number for field dealSize',
    ]);
    expect(lookupError('dealSize', ' ')).toEqual([
      'value must be a number for field dealSize',
    ]);
  });

  it('refuses unknown and read-only fields', () => {
    expect(lookupError('externalId', 'fb-123')).toEqual([
      'field externalId is not a lead field',
    ]);
    expect(lookupError('status', 'new')).toEqual(['field status is read-only']);
  });
});
