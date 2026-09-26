import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { organization } from 'better-auth/plugins';

import { auth } from './auth';

describe('google account linking', () => {
  it('attaches Google to an existing unverified user instead of creating a second user', async () => {
    const production = await auth.$context;
    const memory: Record<string, unknown[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    const linked = betterAuth({
      baseURL: 'http://localhost:8000',
      secret: 'test-secret-that-is-at-least-32-chars',
      database: memoryAdapter(memory),
      emailAndPassword: {
        enabled: production.options.emailAndPassword?.enabled ?? false,
        disableSignUp: production.options.emailAndPassword?.disableSignUp,
      },
      account: {
        accountLinking: production.options.account?.accountLinking,
      },
      socialProviders: {
        google: {
          clientId: 'google-client',
          clientSecret: 'google-secret',
        },
      },
      rateLimit: { enabled: false },
    });

    const context = await linked.$context;
    const existing = await context.internalAdapter.createUser(
      {
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        emailVerified: false,
      },
      { method: 'email' },
    );

    const result = await handleOAuthUserInfo(
      {
        context,
        redirect: () => new Response(null, { status: 302 }),
      } as never,
      {
        userInfo: {
          id: 'google-subject-1',
          email: 'ada@example.com',
          name: 'Ada Lovelace',
          emailVerified: true,
        },
        account: {
          providerId: 'google',
          accountId: 'google-subject-1',
          accessToken: 'access-token',
        },
      },
    );

    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe(existing.id);
    expect(result.data?.user.email).toBe('ada@example.com');

    const users = await context.adapter.findMany({ model: 'user' });
    expect(users).toEqual([
      expect.objectContaining({
        id: existing.id,
        email: 'ada@example.com',
      }),
    ]);

    const accounts = await context.adapter.findMany({ model: 'account' });
    expect(accounts).toEqual([
      expect.objectContaining({
        providerId: 'google',
        accountId: 'google-subject-1',
        userId: existing.id,
      }),
    ]);
  });

  it('leaves a new Google user with no organization', async () => {
    const production = await auth.$context;

    const memory: Record<string, unknown[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
      organization: [],
      member: [],
      invitation: [],
    };
    const fresh = betterAuth({
      baseURL: 'http://localhost:8000',
      secret: 'test-secret-that-is-at-least-32-chars',
      database: memoryAdapter(memory),
      emailAndPassword: {
        enabled: production.options.emailAndPassword?.enabled ?? false,
        disableSignUp: production.options.emailAndPassword?.disableSignUp,
      },
      account: {
        accountLinking: production.options.account?.accountLinking,
      },
      socialProviders: {
        google: {
          clientId: 'google-client',
          clientSecret: 'google-secret',
        },
      },
      databaseHooks: production.options.databaseHooks,
      plugins: [
        organization({
          organizationLimit: 1,
          allowUserToCreateOrganization: false,
        }),
      ],
      rateLimit: { enabled: false },
    });

    const context = await fresh.$context;
    const result = await handleOAuthUserInfo(
      {
        context,
        redirect: () => new Response(null, { status: 302 }),
      } as never,
      {
        userInfo: {
          id: 'google-subject-2',
          email: 'grace@example.com',
          name: 'Grace Hopper',
          emailVerified: true,
        },
        account: {
          providerId: 'google',
          accountId: 'google-subject-2',
          accessToken: 'access-token',
        },
      },
    );

    expect(result.error).toBeNull();
    const users = await context.adapter.findMany({ model: 'user' });
    expect(users).toEqual([
      expect.objectContaining({
        email: 'grace@example.com',
      }),
    ]);
    expect(await context.adapter.findMany({ model: 'organization' })).toEqual([]);
    expect(await context.adapter.findMany({ model: 'member' })).toEqual([]);
  });
});
