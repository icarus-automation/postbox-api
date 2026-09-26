import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import {
  accountPath,
  loadDotEnv,
  readJson,
  withVerifyDatabase,
} from './lib.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${key}`);
  }
  args.set(key, value);
  i += 1;
}

const database = args.get('database');
if (database !== 'dev' && database !== 'verify') {
  throw new Error('Pass --database dev or --database verify');
}

const file = readJson(accountPath, null);
const name = args.get('name') ?? file?.name;
const email = (args.get('email') ?? file?.email)?.toLowerCase();
const password = args.get('password') ?? file?.password;
if (!name || !email || !password) {
  throw new Error('Need name, email, and password, from flags or run/account.json');
}

const env = loadDotEnv();
const databaseUrl =
  database === 'verify' ? withVerifyDatabase(env.DATABASE_URL) : env.DATABASE_URL;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.log(`exists email=${email}`);
  } else {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: false,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: 'credential',
            password: await hashPassword(password),
          },
        },
      },
    });
    console.log(`created email=${email}`);
  }
} finally {
  await prisma.$disconnect();
}
