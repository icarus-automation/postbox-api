import { NotFoundException } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import { SessionOrApiKeyGuard } from '../api-keys/guards/session-or-api-key.guard';
import type { OrganizationSession } from '../auth/types/auth.types';
import type { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadIntakeGuard } from './guards/lead-intake.guard';
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
  const leadsService = mock<LeadsService>();
  const controller = new LeadsController(leadsService);

  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(leadsService);
  });

  it('files a machine-created lead under the key organization', async () => {
    await controller.createLead(body, 'organization-b');

    expect(leadsService.createLead).toHaveBeenCalledWith('organization-b', body);
  });

  it('lets an integration key file a lead but never read the list', () => {
    const optional = (handler: object) => Reflect.getMetadata('OPTIONAL', handler) as unknown;
    const guards = (handler: object) =>
      (Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [];

    expect(guards(LeadsController.prototype.createLead)).toEqual([LeadIntakeGuard]);
    expect(guards(LeadsController.prototype.getAllLeads)).toEqual([SessionOrApiKeyGuard]);
    expect(guards(LeadsController.prototype.getLead)).toEqual([SessionOrApiKeyGuard]);
    expect(optional(LeadsController.prototype.getAllLeads)).toBe(true);
  });

  it('returns not found for leads outside the resolved organization', async () => {
    leadsService.getLead.mockResolvedValue(null);

    await expect(
      controller.getLead('lead-b', 'organization-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(leadsService.getLead).toHaveBeenCalledWith('organization-a', 'lead-b');
  });

  it('edits values on a lead in the session organization', async () => {
    const lead = { id: 'lead-a' } as OrganizationLead;
    const edit = { values: { note: 'Saw your post' } };
    leadsService.updateLeadValues.mockResolvedValue(lead);

    await expect(
      controller.updateLeadValues('lead-a', edit, session),
    ).resolves.toBe(lead);
    expect(leadsService.updateLeadValues).toHaveBeenCalledWith(
      'organization-a',
      'lead-a',
      edit,
    );
  });

  it('returns not found when editing a lead outside the active organization', async () => {
    leadsService.updateLeadValues.mockResolvedValue(null);

    await expect(
      controller.updateLeadValues(
        'lead-b',
        { values: { note: null } },
        session,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets the status on a lead in the session organization', async () => {
    const lead = { id: 'lead-a' } as OrganizationLead;
    leadsService.setLeadStatus.mockResolvedValue(lead);

    await expect(
      controller.setLeadStatus('lead-a', { status: 'qualified' }, session),
    ).resolves.toBe(lead);
    expect(leadsService.setLeadStatus).toHaveBeenCalledWith(
      'organization-a',
      'lead-a',
      'qualified',
    );
  });

  it('returns not found when changing a lead outside the active organization', async () => {
    leadsService.setLeadStatus.mockResolvedValue(null);

    await expect(
      controller.setLeadStatus('lead-b', { status: 'qualified' }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives a lead in the session organization', async () => {
    const lead = { id: 'lead-a' } as OrganizationLead;
    leadsService.setLeadArchived.mockResolvedValue(lead);

    await expect(
      controller.setLeadArchived('lead-a', { isArchived: true }, session),
    ).resolves.toBe(lead);
    expect(leadsService.setLeadArchived).toHaveBeenCalledWith(
      'organization-a',
      'lead-a',
      true,
    );
  });

  it('returns not found when archiving a lead outside the active organization', async () => {
    leadsService.setLeadArchived.mockResolvedValue(null);

    await expect(
      controller.setLeadArchived('lead-b', { isArchived: true }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
