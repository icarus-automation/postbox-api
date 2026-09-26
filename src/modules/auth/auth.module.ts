import { Module } from '@nestjs/common';
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth';

import { OBJECT_STORAGE } from '../content/object-storage';
import { R2ObjectStorage } from '../content/r2-object-storage';
import { auth } from './auth';
import { SetPasswordController } from './set-password.controller';
import { WorkspaceController } from './workspace.controller';

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
  controllers: [WorkspaceController, SetPasswordController],
  providers: [{ provide: OBJECT_STORAGE, useClass: R2ObjectStorage }],
})
export class AuthModule {}
