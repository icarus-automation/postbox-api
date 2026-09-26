import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import type { SetWebhookDTO } from './dto/set-webhook.dto';

export type ContentAccessView = {
  publicKeyLast4: string | null;
  webhookUrl: string | null;
};

@Injectable()
export class ContentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string): Promise<ContentAccessView> {
    const row = await this.prisma.contentAccess.findUnique({
      where: { organizationId },
      select: { publicKeyLast4: true, webhookUrl: true },
    });
    return {
      publicKeyLast4: row?.publicKeyLast4 ?? null,
      webhookUrl: row?.webhookUrl ?? null,
    };
  }

  async rotatePublicKey(organizationId: string): Promise<{ publicKey: string }> {
    const publicKey = `pub_${randomBytes(32).toString('base64url')}`;
    const publicKeyHash = createHash('sha256').update(publicKey).digest('hex');
    const publicKeyLast4 = publicKey.slice(-4);
    await this.prisma.contentAccess.upsert({
      where: { organizationId },
      create: { organizationId, publicKeyHash, publicKeyLast4 },
      update: { publicKeyHash, publicKeyLast4 },
    });
    return { publicKey };
  }

  async setWebhook(organizationId: string, body: SetWebhookDTO): Promise<ContentAccessView> {
    if (body.url !== null && !body.secret) {
      throw new BadRequestException('Webhook secret is required');
    }
    const webhookUrl = body.url;
    const webhookSecret = body.url === null ? null : (body.secret ?? null);
    await this.prisma.contentAccess.upsert({
      where: { organizationId },
      create: { organizationId, webhookUrl, webhookSecret },
      update: { webhookUrl, webhookSecret },
    });
    return this.get(organizationId);
  }

  async authenticate(orgSlug: string, rawKey: string): Promise<string | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!organization) return null;
    const access = await this.prisma.contentAccess.findUnique({
      where: { organizationId: organization.id },
      select: { publicKeyHash: true },
    });
    if (!access?.publicKeyHash) return null;
    const given = createHash('sha256').update(rawKey).digest();
    const stored = Buffer.from(access.publicKeyHash, 'hex');
    if (stored.length !== given.length || !timingSafeEqual(stored, given)) return null;
    return organization.id;
  }
}
