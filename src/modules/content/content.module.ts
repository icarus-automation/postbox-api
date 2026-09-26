import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ContentAccessController } from './content-access.controller';
import { ContentAccessService } from './content-access.service';
import { ContentEntriesController } from './content-entries.controller';
import { ContentEntriesService } from './content-entries.service';
import { ContentMediaController } from './content-media.controller';
import { ContentMediaService } from './content-media.service';
import { ContentWebhook } from './content-webhook.service';
import { PublicReadKeyGuard } from './guards/public-read-key.guard';
import { OBJECT_STORAGE } from './object-storage';
import { PublicContentController } from './public-content.controller';
import { R2ObjectStorage } from './r2-object-storage';

@Module({
  imports: [ApiKeysModule],
  controllers: [
    ContentAccessController,
    ContentMediaController,
    ContentEntriesController,
    PublicContentController,
  ],
  providers: [
    ContentEntriesService,
    ContentMediaService,
    ContentAccessService,
    ContentWebhook,
    PublicReadKeyGuard,
    { provide: OBJECT_STORAGE, useClass: R2ObjectStorage },
  ],
})
export class ContentModule {}
