import { IsBoolean } from 'class-validator';

export class SetLeadArchivedDTO {
  @IsBoolean()
  isArchived: boolean;
}
