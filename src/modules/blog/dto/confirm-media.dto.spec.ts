import { validate } from 'class-validator';

import { ConfirmMediaDTO } from './confirm-media.dto';

describe('ConfirmMediaDTO', () => {
  it('rejects a confirm that omits alt', async () => {
    const dto = new ConfirmMediaDTO();
    dto.storageKey = 'orgs/organization-a/media/file';

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('alt');
  });
});
