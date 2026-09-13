import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateLeadFieldDTO } from './update-lead-field.dto';

async function errorsFor(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateLeadFieldDTO, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

describe('UpdateLeadFieldDTO', () => {
  it('accepts a partial change', async () => {
    await expect(errorsFor({ label: 'Stage' })).resolves.toEqual([]);
    await expect(errorsFor({})).resolves.toEqual([]);
  });

  it('refuses null instead of reading it as omitted', async () => {
    await expect(
      errorsFor({ label: null, isRequired: null, options: null, position: null }),
    ).resolves.toEqual(['label', 'isRequired', 'options', 'position']);
  });

  it('never accepts a new key or type', async () => {
    await expect(
      errorsFor({ key: 'stage', type: 'text' }),
    ).resolves.toEqual(['key', 'type']);
  });
});
