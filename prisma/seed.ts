import { auth } from '../src/modules/auth/auth';
import { prisma } from '../src/core/database/prisma.service';

// Initial owner login. The password comes from SEED_OWNER_PASSWORD so it never
// lands in git. Better Auth hashes it on sign-up and provisions the personal
// organization.
const OWNER = {
  name: 'Ace',
  email: 'acegabriel0809@gmail.com',
};

async function seed(): Promise<void> {
  const password = process.env.SEED_OWNER_PASSWORD;

  if (!password) {
    throw new Error('Set SEED_OWNER_PASSWORD to seed the owner account');
  }

  const existing = await prisma.user.findUnique({
    where: { email: OWNER.email },
    select: { id: true },
  });

  if (existing) {
    console.log(`Seed skipped: ${OWNER.email} already exists`);
    return;
  }

  await auth.api.signUpEmail({ body: { ...OWNER, password } });
  console.log(`Seeded owner ${OWNER.email}`);
}

seed()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
