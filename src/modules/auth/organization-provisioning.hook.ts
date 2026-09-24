import { Injectable } from '@nestjs/common';
import {
  AfterCreate,
  AuthService,
  DatabaseHook,
} from '@thallesp/nestjs-better-auth';

import { PrismaService } from '../../core/database/prisma.service';
import type { Auth } from './auth';
import { provisionPersonalOrganization } from './organization-provisioning';

type CreatedUser = {
  id: string;
  name: string;
  email: string;
};

// Better Auth runs this once the sign-up transaction commits. Holding it in a
// provider is what lets provisioning call auth.api at all: doing it from auth.ts
// would reference the instance being constructed.
@Injectable()
@DatabaseHook()
export class OrganizationProvisioningHook {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly prisma: PrismaService,
  ) {}

  @AfterCreate('user')
  async provisionOrganization(user: CreatedUser): Promise<void> {
    await provisionPersonalOrganization(
      this.authService.api,
      this.prisma,
      user,
    );
  }
}
