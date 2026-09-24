import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';

import type { Auth } from '../auth/auth';
import type { CreateApiKeyDTO } from './dto/create-api-key.dto';
import type {
  ApiKeySummary,
  CreatedApiKey,
  StoredApiKey,
} from './types/api-keys.types';

// Better Auth disables a key rather than deleting it, and stamps updatedAt when
// it does, so a disabled key's updatedAt is when it was revoked.
function toApiKeySummary(apiKey: StoredApiKey): ApiKeySummary {
  return {
    id: apiKey.id,
    name: apiKey.name,
    keyPrefix: apiKey.start,
    lastUsedAt: apiKey.lastRequest,
    revokedAt: apiKey.enabled ? null : apiKey.updatedAt,
    createdAt: apiKey.createdAt,
  };
}

// Thin adapter over the Better Auth API key plugin, which owns generation,
// hashing, storage, verification and usage tracking. Nothing here touches the
// table directly.
@Injectable()
export class ApiKeysService {
  constructor(private readonly authService: AuthService<Auth>) {}

  async createApiKey(
    organizationId: string,
    createdById: string,
    body: CreateApiKeyDTO,
  ): Promise<CreatedApiKey> {
    // No headers, so the plugin treats this as a server call and reads the
    // acting user from the body. It still checks that user's organization role.
    const apiKey = await this.authService.api.createApiKey({
      body: {
        name: body.name,
        organizationId,
        userId: createdById,
        metadata: { createdById },
      },
    });

    return { ...toApiKeySummary(apiKey), key: apiKey.key };
  }

  async getAllApiKeys(
    organizationId: string,
    headers: Headers,
  ): Promise<ApiKeySummary[]> {
    const { apiKeys } = await this.authService.api.listApiKeys({
      headers,
      query: {
        organizationId,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
    });

    return apiKeys.map(toApiKeySummary);
  }

  // Revoking twice leaves the first revocation time alone.
  async revokeApiKey(
    organizationId: string,
    id: string,
    revokedById: string,
    headers: Headers,
  ): Promise<ApiKeySummary | null> {
    const apiKeys = await this.getAllApiKeys(organizationId, headers);
    const apiKey = apiKeys.find((candidate) => candidate.id === id);

    if (!apiKey) return null;
    if (apiKey.revokedAt) return apiKey;

    const revoked = await this.authService.api.updateApiKey({
      body: { keyId: id, enabled: false, userId: revokedById },
    });

    return toApiKeySummary(revoked);
  }
}
