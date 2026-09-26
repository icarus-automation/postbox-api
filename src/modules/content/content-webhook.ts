import { createHmac } from 'node:crypto';

import { Logger } from '@nestjs/common';

import type { ContentWebhookEvent } from './document/content.types';

const logger = new Logger('ContentWebhook');

export async function deliverContentWebhook(
  event: ContentWebhookEvent,
  access: { url: string; secret: string },
): Promise<void> {
  const body = JSON.stringify({
    type: event.type,
    organizationSlug: event.organizationSlug,
    entry: event.entry,
  });
  const signature = createHmac('sha256', access.secret).update(body).digest('hex');
  try {
    const response = await fetch(access.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Content-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.error(
        `content webhook ${event.type} for ${event.organizationSlug} returned ${response.status}`,
      );
    }
  } catch {
    logger.error(
      `content webhook ${event.type} for ${event.organizationSlug} failed`,
    );
  }
}
