import type { Request } from 'express';

import type { OrganizationSession } from '../../auth/types/auth.types';

// The key row as the Better Auth API key plugin returns it, narrowed to what
// this module reads. `key` is the digest and never leaves the plugin.
export type StoredApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  lastRequest: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// `name` and `keyPrefix` are null only if the plugin is reconfigured to stop
// requiring a name or storing starting characters. This API does neither.
export type ApiKeySummary = {
  id: string;
  name: string | null;
  keyPrefix: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

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
