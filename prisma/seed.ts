import { NestFactory } from '@nestjs/core';
import { AuthService } from '@thallesp/nestjs-better-auth';

import { AppModule } from '../src/app.module';
import { prisma } from '../src/core/database/prisma.service';
import type { Auth } from '../src/modules/auth/auth';

// Initial owner login. Better Auth hashes the password on sign-up and
// provisions the personal organization.
const OWNER = {
  name: 'Ace',
  email: 'acegabriel0809@gmail.com',
  password: 'pogingace',
};

async function seed(): Promise<void> {
  // Sign-up provisioning is a Nest provider, registered when the application
  // starts. Calling Better Auth on its own would seed an owner with no
  // organization, so the seed boots the application and goes through it.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: OWNER.email },
      select: { id: true },
    });

    if (existing) {
      console.log(`Seed skipped: ${OWNER.email} already exists`);
      return;
    }

    const auth = app.get<AuthService<Auth>>(AuthService);

    await auth.api.signUpEmail({ body: OWNER });
    console.log(`Seeded owner ${OWNER.email}`);
  } finally {
    // Closing the context runs onModuleDestroy, which disconnects Prisma.
    await app.close();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
