import { Module } from '@nestjs/common';

import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './guards/api-key.guard';
import { SessionOrApiKeyGuard } from './guards/session-or-api-key.guard';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, SessionOrApiKeyGuard],
  exports: [ApiKeysService, ApiKeyGuard, SessionOrApiKeyGuard],
})
export class ApiKeysModule {}
