import { Injectable } from '@nestjs/common';

import { deliverBlogWebhook } from './blog-webhook';
import type { BlogWebhookEvent } from './document/blog.types';

@Injectable()
export class BlogWebhook {
  deliver(
    event: BlogWebhookEvent,
    access: { url: string; secret: string },
  ): Promise<void> {
    return deliverBlogWebhook(event, access);
  }
}
