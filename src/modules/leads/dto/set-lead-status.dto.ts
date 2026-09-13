import { IsIn } from 'class-validator';

import { LEAD_STATUSES, type LeadStatus } from '../lead-system-fields';

export class SetLeadStatusDTO {
  @IsIn(LEAD_STATUSES)
  status: LeadStatus;
}
