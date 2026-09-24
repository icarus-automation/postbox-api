import { createAccessControl } from 'better-auth/plugins/access';
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const API_KEY_MANAGEMENT = ['create', 'read', 'update', 'delete'] as const;

// The API key plugin authorizes organization-owned keys against an `apiKey`
// statement that the stock organization roles do not carry, so the roles are
// redeclared here with it. Everything else stays as Better Auth ships it.
const statements = {
  ...defaultStatements,
  apiKey: API_KEY_MANAGEMENT,
} as const;

export const organizationAccessControl = createAccessControl(statements);

export const organizationRoles = {
  owner: organizationAccessControl.newRole({
    ...ownerAc.statements,
    apiKey: API_KEY_MANAGEMENT,
  }),
  admin: organizationAccessControl.newRole({
    ...adminAc.statements,
    apiKey: API_KEY_MANAGEMENT,
  }),
  // Members read leads. They never mint or revoke a key.
  member: organizationAccessControl.newRole({
    ...memberAc.statements,
    apiKey: [],
  }),
};
