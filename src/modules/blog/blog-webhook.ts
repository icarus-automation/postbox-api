import { createHmac } from 'node:crypto';

import { Logger } from '@nestjs/common';

import type { BlogWebhookEvent } from './document/blog.types';

const logger = new Logger('BlogWebhook');

export async function deliverBlogWebhook(
  event: BlogWebhookEvent,
  access: { url: string; secret: string },
): Promise<void> {
  const body = JSON.stringify({
    type: event.type,
    organizationSlug: event.organizationSlug,
    post: event.post,
  });
  const signature = createHmac('sha256', access.secret).update(body).digest('hex');
  try {
    const response = await fetch(access.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Blog-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.error(
        `blog webhook ${event.type} for ${event.organizationSlug} returned ${response.status}`,
      );
    }
  } catch {
    logger.error(
      `blog webhook ${event.type} for ${event.organizationSlug} failed`,
    );
  }
}
