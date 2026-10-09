import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { organization } from 'better-auth/plugins';

import { auth } from './auth';

describe('email and password', () => {
  it('opens email sign-up in the production config', async () => {
    // A short password is refused before anything is written, so this reaches the
    // sign-up checks without adding a user. A closed sign-up fails earlier, with
    // EMAIL_PASSWORD_SIGN_UP_DISABLED.
    await expect(
      auth.api.signUpEmail({
        body: {
          name: 'Ada Lovelace',
          email: 'ada-signup@example.com',
          password: 'short',
        },
      }),
    ).rejects.toMatchObject({
      body: { code: 'PASSWORD_TOO_SHORT' },
    });
  });

  it('still accepts an email sign-in attempt', async () => {
    await expect(
      auth.api.signInEmail({
        body: {
          email: 'nobody-signin@example.com',
          password: 'correct-horse',
        },
      }),
    ).rejects.toMatchObject({
      body: { code: 'INVALID_EMAIL_OR_PASSWORD' },
    });
  });

  describe('sign-up', () => {
    /** The production email, password and session settings over an in-memory database. */
    async function signUpAuth() {
      const production = await auth.$context;
      const instance = betterAuth({
        baseURL: 'http://localhost:8000',
        secret: 'test-secret-that-is-at-least-32-chars',
        database: memoryAdapter({
          user: [],
          session: [],
          account: [],
          verification: [],
          organization: [],
          member: [],
          invitation: [],
        }),
        emailAndPassword: production.options.emailAndPassword,
        databaseHooks: production.options.databaseHooks,
        plugins: [
          organization({
            organizationLimit: 1,
            allowUserToCreateOrganization: false,
          }),
        ],
        rateLimit: { enabled: false },
      });

      return { instance, context: await instance.$context };
    }

    const ada = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse' };

    it('signs the new user in, unverified and with no organization', async () => {
      const { instance, context } = await signUpAuth();

      const response = await instance.api.signUpEmail({ body: ada, asResponse: true });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        token: string | null;
        user: { email: string; emailVerified: boolean };
      };
      expect(body.token).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ email: 'ada@example.com', emailVerified: false });
      expect(
        response.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith('better-auth.session_token=')),
      ).toBe(true);

      const sessions = await context.adapter.findMany<{ activeOrganizationId?: string | null }>({
        model: 'session',
      });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].activeOrganizationId ?? null).toBeNull();
      expect(await context.adapter.findMany({ model: 'organization' })).toEqual([]);
      expect(await context.adapter.findMany({ model: 'member' })).toEqual([]);
    });

    it('lets the new user sign in with the same password', async () => {
      const { instance } = await signUpAuth();
      await instance.api.signUpEmail({ body: ada });

      await expect(
        instance.api.signInEmail({ body: { email: ada.email, password: ada.password } }),
      ).resolves.toMatchObject({ user: { email: 'ada@example.com' } });
    });

    it('refuses an email that already has an account', async () => {
      const { instance } = await signUpAuth();
      await instance.api.signUpEmail({ body: ada });

      await expect(
        instance.api.signUpEmail({ body: { ...ada, email: 'ADA@example.com' } }),
      ).rejects.toMatchObject({
        statusCode: 422,
        body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' },
      });
    });

    it('refuses a password under eight characters', async () => {
      const { instance, context } = await signUpAuth();

      await expect(
        instance.api.signUpEmail({ body: { ...ada, password: 'seven77' } }),
      ).rejects.toMatchObject({
        statusCode: 400,
        body: { code: 'PASSWORD_TOO_SHORT' },
      });
      expect(await context.adapter.findMany({ model: 'user' })).toEqual([]);
    });
  });
});
