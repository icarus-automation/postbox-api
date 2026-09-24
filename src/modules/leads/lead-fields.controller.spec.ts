import { NotFoundException } from '@nestjs/common';
import { FieldType } from '@prisma/client';
import { mock, mockReset } from 'jest-mock-extended';

import type { OrganizationSession } from '../auth/types/auth.types';
import { LeadFieldsController } from './lead-fields.controller';
import { LeadFieldsService } from './lead-fields.service';

describe('LeadFieldsController', () => {
  const leadFieldsService = mock<LeadFieldsService>();
  const controller = new LeadFieldsController(leadFieldsService);

  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(leadFieldsService);
  });

  it('creates a field in the session organization', async () => {
    const body = {
      key: 'dealSize',
      label: 'Deal size',
      type: FieldType.number,
    };

    await controller.createLeadField(body, session);

    expect(leadFieldsService.createLeadField).toHaveBeenCalledWith(
      'organization-a',
      body,
    );
  });

  it('returns not found for fields outside the active organization', async () => {
    leadFieldsService.updateLeadField.mockResolvedValue(null);
    leadFieldsService.deleteLeadField.mockResolvedValue(null);

    await expect(
      controller.updateLeadField('field-b', { label: 'Budget' }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.deleteLeadField('field-b', session),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(leadFieldsService.deleteLeadField).toHaveBeenCalledWith(
      'organization-a',
      'field-b',
    );
  });
});
