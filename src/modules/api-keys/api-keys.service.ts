import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import type { CreateApiKeyDTO } from './dto/create-api-key.dto';
import type {
  ApiKeyPrincipal,
  ApiKeySummary,
  CreatedApiKey,
} from './types/api-keys.types';

const KEY_LABEL = 'cms';
const KEY_ENTROPY_BYTES = 32;
const KEY_PREFIX_LENGTH = 12;

const API_KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ApiKeySelect;

function generateApiKey(): string {
  return `${KEY_LABEL}_${randomBytes(KEY_ENTROPY_BYTES).toString('base64url')}`;
}

// Keys carry 256 bits of entropy, so an unsalted digest stores them unreadably
// while still allowing a single indexed lookup on authentication.
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(
    organizationId: string,
    createdById: string,
    body: CreateApiKeyDTO,
  ): Promise<CreatedApiKey> {
    const key = generateApiKey();

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: body.name,
        keyPrefix: key.slice(0, KEY_PREFIX_LENGTH),
        keyHash: hashApiKey(key),
        organizationId,
        createdById,
      },
      select: API_KEY_SELECT,
    });

    return { ...apiKey, key };
  }

  getAllApiKeys(organizationId: string): Promise<ApiKeySummary[]> {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      select: API_KEY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(
    organizationId: string,
    id: string,
  ): Promise<ApiKeySummary | null> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id, organizationId },
      select: API_KEY_SELECT,
    });

    if (!apiKey || apiKey.revokedAt) return apiKey;

    return this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
      select: API_KEY_SELECT,
    });
  }

  async authenticateApiKey(key: string): Promise<ApiKeyPrincipal | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(key) },
      select: { id: true, organizationId: true, revokedAt: true },
    });

    if (!apiKey || apiKey.revokedAt) return null;

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return { id: apiKey.id, organizationId: apiKey.organizationId };
  }
}
