import { randomBytes } from 'node:crypto';

import type { PrismaService } from '../../core/database/prisma.service';
import type { IntegrationKeyRequest } from './types/integration-key.types';

// A website sends its key here. It is not x-api-key, which the browser is never
// allowed to send, so the public API can allow this one cross-origin and nothing else.
export const INTEGRATION_KEY_HEADER = 'x-integration-key';

export const INTEGRATION_KEY_PREFIX = 'pbi_';

export function newIntegrationKey(): string {
  return `${INTEGRATION_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

// The key a request carries, or undefined when it carries none. A header that is
// present but blank comes back as an empty string, which no key matches.
export function readIntegrationKey(
  headers: IntegrationKeyRequest['headers'],
): string | undefined {
  const header = headers[INTEGRATION_KEY_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim();
}

// Every organization gets its key when it is created, so nobody has to ask for one.
export async function provisionIntegrationKey(
  db: PrismaService,
  organizationId: string,
): Promise<void> {
  await db.integrationKey.create({
    data: { organizationId, key: newIntegrationKey() },
  });
}
