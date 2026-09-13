import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { SessionOrApiKeyGuard } from '../api-keys/guards/session-or-api-key.guard';
import type { OrganizationSession } from '../auth/types/auth.types';
import type { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import type { OrganizationLead } from './types/leads.types';

const body: CreateLeadDTO = {
  values: {
    candidate: 'Dana Reyes',
    product: 'POS',
    source: 'https://example.com/groups/indie/posts/1',
    signal: 'Asked for a POS that agents can post into',
    whyLead: 'Wants exactly what the product does and is shopping now.',
  },
};

describe('LeadsController', () => {
  const createLead = jest.fn<LeadsService['createLead']>();
  const getLead = jest.fn<LeadsService['getLead']>();
  const updateLeadValues = jest.fn<LeadsService['updateLeadValues']>();
  const setLeadStatus = jest.fn<LeadsService['setLeadStatus']>();

  let controller: LeadsController;

  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(async () => {
    createLead.mockReset();
    getLead.mockReset();
    updateLeadValues.mockReset();
    setLeadStatus.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [
        {
          provide: LeadsService,
          useValue: { createLead, getLead, updateLeadValues, setLeadStatus },
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SessionOrApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(LeadsController);
  });

  it('files a machine-created lead under the API key organization', async () => {
    await controller.createLead(body, {
      id: 'key-a',
      organizationId: 'organization-b',
    });

    expect(createLead).toHaveBeenCalledWith('organization-b', body);
  });

  it('returns not found for leads outside the resolved organization', async () => {
    getLead.mockResolvedValue(null);

    await expect(
      controller.getLead('lead-b', 'organization-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getLead).toHaveBeenCalledWith('organization-a', 'lead-b');
  });

  it('edits values on a lead in the session organization', async () => {
    const lead = { id: 'lead-a' } as OrganizationLead;
    const edit = { values: { draftOpener: 'Saw your post' } };
    updateLeadValues.mockResolvedValue(lead);

    await expect(
      controller.updateLeadValues('lead-a', edit, session),
    ).resolves.toBe(lead);
    expect(updateLeadValues).toHaveBeenCalledWith(
      'organization-a',
      'lead-a',
      edit,
    );
  });

  it('returns not found when editing a lead outside the active organization', async () => {
    updateLeadValues.mockResolvedValue(null);

    await expect(
      controller.updateLeadValues(
        'lead-b',
        { values: { draftOpener: null } },
        session,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets the status on a lead in the session organization', async () => {
    const lead = { id: 'lead-a' } as OrganizationLead;
    setLeadStatus.mockResolvedValue(lead);

    await expect(
      controller.setLeadStatus('lead-a', { status: 'qualified' }, session),
    ).resolves.toBe(lead);
    expect(setLeadStatus).toHaveBeenCalledWith(
      'organization-a',
      'lead-a',
      'qualified',
    );
  });

  it('returns not found when changing a lead outside the active organization', async () => {
    setLeadStatus.mockResolvedValue(null);

    await expect(
      controller.setLeadStatus('lead-b', { status: 'archived' }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
