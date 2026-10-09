import { env } from '../../core/config/env.config';
import { auth } from './auth';

describe('trusted origins', () => {
  it('accepts every CORS origin as the Google callback and error callback', async () => {
    const context = await auth.$context;

    expect(env.CORS_ALLOWED_ORIGINS.length).toBeGreaterThan(0);
    for (const origin of env.CORS_ALLOWED_ORIGINS) {
      expect(context.isTrustedOrigin(`${origin}/`)).toBe(true);
      expect(context.isTrustedOrigin(`${origin}/login`)).toBe(true);
    }
  });

  it('refuses a callback on an origin outside CORS_ALLOWED_ORIGINS', async () => {
    const context = await auth.$context;

    expect(context.isTrustedOrigin('https://evil.example.com/')).toBe(false);
  });
});
