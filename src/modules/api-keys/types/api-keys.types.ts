import type { ApiKey } from '@prisma/client';
import type { Request } from 'express';

import type { OrganizationSession } from '../../auth/types/auth.types';

export type ApiKeySummary = Pick<
  ApiKey,
  'id' | 'name' | 'keyPrefix' | 'lastUsedAt' | 'revokedAt' | 'createdAt'
>;

// Only ever returned by creation. The raw key is unreadable afterwards.
export type CreatedApiKey = ApiKeySummary & {
  key: string;
};

export type ApiKeyPrincipal = {
  id: string;
  organizationId: string;
};

export type ApiKeyRequest = Request & {
  apiKey?: ApiKeyPrincipal;
};

// Past SessionOrApiKeyGuard, exactly one of session and apiKey is set.
export type SessionOrApiKeyRequest = ApiKeyRequest & {
  session?: OrganizationSession | null;
};
