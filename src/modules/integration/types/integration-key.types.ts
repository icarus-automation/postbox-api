import type { Request } from 'express';

export type IntegrationKeyView = {
  key: string;
};

export type IntegrationKeyPrincipal = {
  organizationId: string;
};

// What an integration key guard leaves on the request.
export type IntegrationKeyRequest = Request & {
  integrationKey?: IntegrationKeyPrincipal;
};
