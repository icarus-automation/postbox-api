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

  it('reads the two words a query string can carry for archived', async () => {
    const inbox = plainToInstance(FilterLeadsDTO, {});
    const archive = plainToInstance(FilterLeadsDTO, { archived: 'true' });
    const back = plainToInstance(FilterLeadsDTO, { archived: 'false' });

    expect(inbox.archived).toBe(false);
    expect(archive.archived).toBe(true);
    expect(back.archived).toBe(false);
    await expect(errorsFor({ archived: 'true' })).resolves.toEqual([]);
  });

  it('refuses anything else for archived rather than reading it as false', async () => {
    await expect(errorsFor({ archived: 'yes' })).resolves.toEqual(['archived']);
    await expect(errorsFor({ archived: '1' })).resolves.toEqual(['archived']);
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
