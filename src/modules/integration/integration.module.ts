import { Module } from '@nestjs/common';

import { IntegrationGuideController } from './integration-guide.controller';
import { IntegrationKeyController } from './integration-key.controller';
import { IntegrationKeyService } from './integration-key.service';

@Module({
  controllers: [IntegrationKeyController, IntegrationGuideController],
  providers: [IntegrationKeyService],
  exports: [IntegrationKeyService],
})
export class IntegrationModule {}
