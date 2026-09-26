import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalEnv = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().startsWith('postgresql://').min(1),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // A label shown in front of the workspace slug. Not a URL, and a trailing slash stays.
  WORKSPACE_URL_PREFIX: z.string().min(1),

  // Empty values in local env files are the same as unset. Presign answers
  // 503 until all five are present.
  R2_ACCOUNT_ID: optionalEnv,
  R2_ACCESS_KEY_ID: optionalEnv,
  R2_SECRET_ACCESS_KEY: optionalEnv,
  R2_BUCKET: optionalEnv,
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
