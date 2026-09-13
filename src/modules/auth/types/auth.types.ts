import type { UserSession } from '@thallesp/nestjs-better-auth';

import type { Auth } from '../auth';

// A session the auth guard has already checked for an active organization,
// through @OrgRoles() or @MemberHasPermission().
export type OrganizationSession = UserSession<Auth> & {
  session: {
    activeOrganizationId: string;
  };
};
