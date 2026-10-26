import { mock, mockReset } from 'jest-mock-extended';

import type { OrganizationSession } from '../auth/types/auth.types';
import { IntegrationKeyController } from './integration-key.controller';
import type { IntegrationKeyService } from './integration-key.service';

describe('IntegrationKeyController', () => {
  const keys = mock<IntegrationKeyService>();
  const controller = new IntegrationKeyController(keys);
  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(keys);
  });

  it('reads the key of the session organization', async () => {
    keys.getIntegrationKey.mockResolvedValue({ key: 'pbi_live' });

    await expect(controller.getIntegrationKey(session)).resolves.toEqual({ key: 'pbi_live' });
    expect(keys.getIntegrationKey).toHaveBeenCalledWith('organization-a');
  });

  it('rotates the key of the session organization', async () => {
    keys.rotateIntegrationKey.mockResolvedValue({ key: 'pbi_new' });

    await expect(controller.rotateIntegrationKey(session)).resolves.toEqual({ key: 'pbi_new' });
    expect(keys.rotateIntegrationKey).toHaveBeenCalledWith('organization-a');
  });

  it('is for owners and admins on a session, never a key or a member', () => {
    const roles = Reflect.getMetadata('ORG_ROLES', IntegrationKeyController) as unknown;
    const optional = (handler: object) => Reflect.getMetadata('OPTIONAL', handler) as unknown;
    const anonymous = (target: object) => Reflect.getMetadata('PUBLIC', target) as unknown;

    expect(roles).toEqual(['owner', 'admin']);
    expect(optional(IntegrationKeyController.prototype.getIntegrationKey)).toBeUndefined();
    expect(optional(IntegrationKeyController.prototype.rotateIntegrationKey)).toBeUndefined();
    expect(anonymous(IntegrationKeyController)).toBeUndefined();
  });
});
