import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import type { SetWebhookDTO } from './dto/set-webhook.dto';

export type BlogAccessView = {
  webhookUrl: string | null;
};

@Injectable()
export class BlogAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getBlogAccess(organizationId: string): Promise<BlogAccessView> {
    const row = await this.prisma.blogAccess.findUnique({
      where: { organizationId },
      select: { webhookUrl: true },
    });
    return { webhookUrl: row?.webhookUrl ?? null };
  }

  async setWebhook(organizationId: string, body: SetWebhookDTO): Promise<BlogAccessView> {
    if (body.url !== null && !body.secret) {
      throw new BadRequestException('Webhook secret is required');
    }
    const webhookUrl = body.url;
    const webhookSecret = body.url === null ? null : (body.secret ?? null);
    await this.prisma.blogAccess.upsert({
      where: { organizationId },
      create: { organizationId, webhookUrl, webhookSecret },
      update: { webhookUrl, webhookSecret },
    });
    return this.getBlogAccess(organizationId);
  }
}
