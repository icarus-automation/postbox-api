import { Injectable } from '@nestjs/common';

import { deliverContentWebhook } from './content-webhook';
import type { ContentWebhookEvent } from './document/content.types';

@Injectable()
export class ContentWebhook {
  deliver(
    event: ContentWebhookEvent,
    access: { url: string; secret: string },
  ): Promise<void> {
    return deliverContentWebhook(event, access);
  }
}
