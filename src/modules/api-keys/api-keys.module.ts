import { Module } from '@nestjs/common';

import { IntegrationModule } from '../integration/integration.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { SessionOrApiKeyGuard } from './guards/session-or-api-key.guard';

@Module({
  imports: [IntegrationModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, SessionOrApiKeyGuard],
  exports: [ApiKeyGuard, SessionOrApiKeyGuard],
})
export class ApiKeysModule {}
