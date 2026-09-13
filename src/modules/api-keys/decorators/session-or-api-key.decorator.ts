import { applyDecorators, UseGuards } from '@nestjs/common';
import { OptionalAuth, OrgRoles } from '@thallesp/nestjs-better-auth';

import { SessionOrApiKeyGuard } from '../guards/session-or-api-key.guard';

// Opens a read route to an API key as well as a session. The global session guard
// still enforces these roles on any session it finds, and a request without one
// needs a valid key. Read the organization with @CurrentOrganizationId().
export const SessionOrApiKey = (roles: string[]) =>
  applyDecorators(
    OptionalAuth(),
    OrgRoles(roles),
    UseGuards(SessionOrApiKeyGuard),
  );
