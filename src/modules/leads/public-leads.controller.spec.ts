import { mock, mockReset } from 'jest-mock-extended';

import type { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';
import { PublicLeadsController } from './public-leads.controller';
import type { OrganizationLead } from './types/leads.types';

const body: CreateLeadDTO = {
  values: {
    candidate: 'Dana Reyes',
    product: 'POS',
    source: 'https://acme.example/contact',
    signal: 'I would like a demo.',
    whyLead: 'Contact form on the website',
  },
};

describe('PublicLeadsController', () => {
  const leadsService = mock<LeadsService>();
  const controller = new PublicLeadsController(leadsService);

  beforeEach(() => {
    mockReset(leadsService);
  });

  it('files the lead under the organization of the integration key', async () => {
    leadsService.createLead.mockResolvedValue({ id: 'lead-a' } as OrganizationLead);

    await controller.submitLead(body, 'organization-a');

    expect(leadsService.createLead).toHaveBeenCalledWith('organization-a', body);
  });

  it('answers with the id and nothing else of the lead', async () => {
    leadsService.createLead.mockResolvedValue({
      id: 'lead-a',
      values: { candidate: 'Dana Reyes', status: 'new', whyLead: 'Contact form' },
      isArchived: false,
      createdAt: new Date('2026-10-25T00:00:00.000Z'),
      updatedAt: new Date('2026-10-25T00:00:00.000Z'),
    });

    await expect(controller.submitLead(body, 'organization-a')).resolves.toEqual({
      id: 'lead-a',
    });
  });

  it('is open to a visitor with a key, and is capped tighter than the rest of the API', () => {
    const anonymous = Reflect.getMetadata('PUBLIC', PublicLeadsController) as unknown;
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', PublicLeadsController) as unknown;

    expect(anonymous).toBe(true);
    expect(limit).toBe(10);
  });
});
