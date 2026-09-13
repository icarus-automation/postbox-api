import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SetLeadStatusDTO } from './set-lead-status.dto';

async function errorsFor(body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(SetLeadStatusDTO, body));
  return errors.map((error) => error.property);
}

describe('SetLeadStatusDTO', () => {
  it('accepts every lead status', async () => {
    for (const status of ['new', 'contacted', 'qualified', 'archived']) {
      await expect(errorsFor({ status })).resolves.toEqual([]);
    }
  });

  it('rejects a status the pipeline does not have', async () => {
    await expect(errorsFor({ status: 'won' })).resolves.toEqual(['status']);
  });

  it('rejects a body with no status', async () => {
    await expect(errorsFor({})).resolves.toEqual(['status']);
  });
});
