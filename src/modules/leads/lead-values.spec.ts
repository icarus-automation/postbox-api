import { BadRequestException } from '@nestjs/common';
import { FieldType } from '@prisma/client';

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
): string[] {
  try {
    parseLeadValues(fields, input, mode);
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
      parseLeadValues(fields, { ...complete, note: null }, 'create')
        .clear,
    ).toEqual([]);

    const changes = parseLeadValues(fields, { note: null }, 'update');
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
