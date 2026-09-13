import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldType } from '@prisma/client';

import { SessionOrApiKeyGuard } from '../api-keys/guards/session-or-api-key.guard';
import type { OrganizationSession } from '../auth/types/auth.types';
import { LeadFieldsController } from './lead-fields.controller';
import { LeadFieldsService } from './lead-fields.service';

describe('LeadFieldsController', () => {
  const createLeadField = jest.fn<LeadFieldsService['createLeadField']>();
  const updateLeadField = jest.fn<LeadFieldsService['updateLeadField']>();
  const deleteLeadField = jest.fn<LeadFieldsService['deleteLeadField']>();

  let controller: LeadFieldsController;

  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(async () => {
    createLeadField.mockReset();
    updateLeadField.mockReset();
    deleteLeadField.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadFieldsController],
      providers: [
        {
          provide: LeadFieldsService,
          useValue: { createLeadField, updateLeadField, deleteLeadField },
        },
      ],
    })
      .overrideGuard(SessionOrApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(LeadFieldsController);
  });

  it('creates a field in the session organization', async () => {
    const body = {
      key: 'dealSize',
      label: 'Deal size',
      type: FieldType.number,
    };

    await controller.createLeadField(body, session);

    expect(createLeadField).toHaveBeenCalledWith('organization-a', body);
  });

  it('returns not found for fields outside the active organization', async () => {
    updateLeadField.mockResolvedValue(null);
    deleteLeadField.mockResolvedValue(null);

    await expect(
      controller.updateLeadField('field-b', { label: 'Budget' }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.deleteLeadField('field-b', session),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteLeadField).toHaveBeenCalledWith('organization-a', 'field-b');
  });
});
