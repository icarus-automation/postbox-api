import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { INTEGRATION_KEY_PREFIX, newIntegrationKey } from './integration-key';
import type { IntegrationKeyView } from './types/integration-key.types';

@Injectable()
export class IntegrationKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntegrationKey(organizationId: string): Promise<IntegrationKeyView> {
    const row = await this.prisma.integrationKey.findUnique({
      where: { organizationId },
      select: { key: true },
    });
    if (!row) throw new NotFoundException('Integration key not found');
    return { key: row.key };
  }

  // The old key stops working with this write. An organization that somehow has no
  // key gets one here too.
  async rotateIntegrationKey(organizationId: string): Promise<IntegrationKeyView> {
    const key = newIntegrationKey();
    await this.prisma.integrationKey.upsert({
      where: { organizationId },
      create: { organizationId, key },
      update: { key },
    });
    return { key };
  }

  // The organization a key belongs to, or null. Given a slug, the key has to be that
  // organization's, so one organization's key never opens another's routes.
  async authenticate(rawKey: string, orgSlug?: string): Promise<string | null> {
    if (!rawKey.startsWith(INTEGRATION_KEY_PREFIX)) return null;
    const row = await this.prisma.integrationKey.findFirst({
      where: {
        key: rawKey,
        ...(orgSlug ? { organization: { slug: orgSlug } } : {}),
      },
      select: { organizationId: true },
    });
    return row?.organizationId ?? null;
  }
}
