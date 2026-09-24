import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';

import { auth } from './auth';
import { OrganizationProvisioningHook } from './organization-provisioning.hook';

@Module({
  imports: [
    BetterAuthModule.forRoot({
      auth,
      bodyParser: {
        json: { limit: '1mb' },
        urlencoded: { extended: true, limit: '1mb' },
      },
    }),
  ],
  providers: [OrganizationProvisioningHook],
})
export class AuthModule {}
