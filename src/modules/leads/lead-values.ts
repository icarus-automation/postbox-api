import { BadRequestException } from '@nestjs/common';
import { FieldType } from '@prisma/client';
import { isISO8601, isURL } from 'class-validator';

import type { LeadField, LeadFieldValue } from './types/leads.types';

const TEXT_MAX_LENGTH = 500;
const LONG_TEXT_MAX_LENGTH = 5000;
const URL_MAX_LENGTH = 2048;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type LeadValueChanges = {
  set: { field: LeadField; value: LeadFieldValue }[];
  clear: LeadField[];
};

export type LeadLookup = { field: LeadField; value: LeadFieldValue };

function isNonBlankText(value: unknown, maxLength: number): boolean {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= maxLength
  );
}

// Says why a value does not fit its field, or returns null when it does.
function describeInvalidValue(field: LeadField, value: unknown): string | null {
  switch (field.type) {
    case FieldType.text:
      return isNonBlankText(value, TEXT_MAX_LENGTH)
        ? null
        : `must be non-blank text of at most ${TEXT_MAX_LENGTH} characters`;
    case FieldType.long_text:
      return isNonBlankText(value, LONG_TEXT_MAX_LENGTH)
        ? null
        : `must be non-blank text of at most ${LONG_TEXT_MAX_LENGTH} characters`;
    case FieldType.url:
      return typeof value === 'string' &&
        value.length <= URL_MAX_LENGTH &&
        isURL(value, { require_protocol: true, protocols: ['http', 'https'] })
        ? null
        : `must be an http or https URL of at most ${URL_MAX_LENGTH} characters`;
    case FieldType.select:
      return typeof value === 'string' && field.options.includes(value)
        ? null
        : `must be one of: ${field.options.join(', ')}`;
    case FieldType.number:
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : 'must be a number';
    case FieldType.date:
      return typeof value === 'string' &&
        DATE_PATTERN.test(value) &&
        isISO8601(value, { strict: true })
        ? null
        : 'must be a date formatted YYYY-MM-DD';
    case FieldType.datetime:
      return typeof value === 'string' && isISO8601(value, { strict: true })
        ? null
        : 'must be an ISO 8601 date-time';
  }
}

// Checks a values payload against the organization's lead fields and collects
// every problem into one 400. Unknown and read-only keys are refused. On create a
// null counts as absent and every required field must be given. On update only
// the given keys change, and null clears a value.
export function parseLeadValues(
  fields: LeadField[],
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): LeadValueChanges {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const changes: LeadValueChanges = { set: [], clear: [] };
  const errors: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    const field = fieldsByKey.get(key);

    if (!field) {
      errors.push(`values.${key} is not a lead field`);
    } else if (field.isReadOnly) {
      errors.push(`values.${key} is read-only`);
    } else if (value === null) {
      if (field.isRequired) errors.push(`values.${key} is required`);
      else if (mode === 'update') changes.clear.push(field);
    } else {
      const problem = describeInvalidValue(field, value);

      if (problem) errors.push(`values.${key} ${problem}`);
      else changes.set.push({ field, value: value as LeadFieldValue });
    }
  }

  if (mode === 'create') {
    for (const field of fields) {
      if (field.isRequired && !Object.hasOwn(input, field.key)) {
        errors.push(`values.${field.key} is required`);
      }
    }
  }

  if (errors.length > 0) throw new BadRequestException(errors);

  return changes;
}

// Reads an exact-match lookup such as field=source&value=<url>. The value is only
// parsed, never held to the field's current rules, so a lead that still holds a
// removed select option can be found.
export function parseLeadLookup(
  fields: LeadField[],
  key: string,
  value: string,
): LeadLookup {
  const field = fields.find((candidate) => candidate.key === key);

  if (!field) {
    throw new BadRequestException([`field ${key} is not a lead field`]);
  }
  if (field.isReadOnly) {
    throw new BadRequestException([`field ${key} is read-only`]);
  }
  if (field.type !== FieldType.number) return { field, value };

  const number = Number(value);

  if (value.trim() === '' || !Number.isFinite(number)) {
    throw new BadRequestException([`value must be a number for field ${key}`]);
  }

  return { field, value: number };
}
