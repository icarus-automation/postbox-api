import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateLeadFieldDTO } from './create-lead-field.dto';

async function errorsFor(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateLeadFieldDTO, body));
  return errors.map((error) => error.property);
}

describe('CreateLeadFieldDTO', () => {
  it('accepts a camelCase key and each custom field type', async () => {
    for (const type of ['text', 'long_text', 'number', 'url', 'date']) {
      await expect(
        errorsFor({ key: 'followUpOn', label: 'Follow up on', type }),
      ).resolves.toEqual([]);
    }
    await expect(
      errorsFor({
        key: 'tier',
        label: 'Tier',
        type: 'select',
        options: ['Gold', 'Silver'],
      }),
    ).resolves.toEqual([]);
  });

  it('refuses keys that are not camelCase', async () => {
    for (const key of ['Deal', 'deal_size', 'deal-size', '2fa', '']) {
      await expect(
        errorsFor({ key, label: 'Deal', type: 'text' }),
      ).resolves.toEqual(['key']);
    }
  });

  it('keeps datetime for system fields', async () => {
    await expect(
      errorsFor({ key: 'contactedAt', label: 'Contacted', type: 'datetime' }),
    ).resolves.toEqual(['type']);
  });

  it('refuses empty or repeated options', async () => {
    await expect(
      errorsFor({ key: 'tier', label: 'Tier', type: 'select', options: [] }),
    ).resolves.toEqual(['options']);
    await expect(
      errorsFor({
        key: 'tier',
        label: 'Tier',
        type: 'select',
        options: ['Gold', 'Gold'],
      }),
    ).resolves.toEqual(['options']);
  });
});
