import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { LeadFieldsController } from './lead-fields.controller';
import { LeadFieldsService } from './lead-fields.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [ApiKeysModule],
  // Routes register in this order. LeadFieldsController goes first so that
  // /leads/fields is not captured by /leads/:id.
  controllers: [LeadFieldsController, LeadsController],
  providers: [LeadFieldsService, LeadsService],
})
export class LeadsModule {}
