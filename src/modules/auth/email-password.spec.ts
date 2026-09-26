import { auth } from './auth';

describe('email and password', () => {
  it('rejects email sign-up and still accepts an email sign-in attempt', async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          name: 'Ada Lovelace',
          email: 'ada-signup@example.com',
          password: 'correct-horse',
        },
      }),
    ).rejects.toMatchObject({
      body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
    });

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
});
