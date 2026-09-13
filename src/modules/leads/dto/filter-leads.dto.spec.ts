import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FilterLeadsDTO } from './filter-leads.dto';

async function errorsFor(query: object): Promise<string[]> {
  const errors = await validate(plainToInstance(FilterLeadsDTO, query));
  return errors.map((error) => error.property);
}

describe('FilterLeadsDTO', () => {
  it('accepts a lookup given as a field and a value', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
    await expect(
      errorsFor({ field: 'source', value: 'https://example.com/a' }),
    ).resolves.toEqual([]);
  });

  it('refuses half a lookup', async () => {
    await expect(errorsFor({ field: 'source' })).resolves.toEqual(['value']);
    await expect(errorsFor({ value: 'https://example.com/a' })).resolves.toEqual(
      ['field'],
    );
  });

  it('refuses an empty or repeated lookup value', async () => {
    await expect(errorsFor({ field: 'source', value: '' })).resolves.toEqual([
      'value',
    ]);
    await expect(
      errorsFor({ field: 'source', value: ['a', 'b'] }),
    ).resolves.toEqual(['value']);
  });
});
