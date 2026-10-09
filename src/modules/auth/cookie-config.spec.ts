import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

import { cookieSettings, sharedCookieDomain } from './cookie-config';

describe('sharedCookieDomain', () => {
  it('shares cookies when the API is an https host inside the domain', () => {
    expect(sharedCookieDomain('https://postbox-api.geoplanph.com', 'geoplanph.com')).toBe(
      'geoplanph.com',
    );
    expect(sharedCookieDomain('https://geoplanph.com', ' .GeoplanPH.com ')).toBe('geoplanph.com');
  });

  it('keeps host-only cookies when the domain is unset or does not cover the API', () => {
    expect(sharedCookieDomain('https://postbox-api.geoplanph.com', undefined)).toBeUndefined();
    expect(sharedCookieDomain('http://localhost:8000', 'geoplanph.com')).toBeUndefined();
    expect(sharedCookieDomain('http://postbox-api.geoplanph.com', 'geoplanph.com')).toBeUndefined();
    expect(
      sharedCookieDomain('https://postbox-api.notgeoplanph.com', 'geoplanph.com'),
    ).toBeUndefined();
  });
});

describe('cookieSettings', () => {
  /** Signs a user up and returns the session cookie's name and its attributes. */
  async function sessionCookie(
    baseURL: string,
    domain: string | undefined,
  ): Promise<{ name: string; attributes: string[] }> {
    const instance = betterAuth({
      baseURL,
      basePath: '/api/v1/auth',
      secret: 'test-secret-that-is-at-least-32-chars',
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true },
      advanced: cookieSettings(domain),
      rateLimit: { enabled: false },
    });

    const response = await instance.api.signUpEmail({
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse' },
      asResponse: true,
    });
    const line = response.headers
      .getSetCookie()
      .find((cookie) => cookie.includes('session_token='));
    if (!line) throw new Error('No session cookie was set');

    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    return { name: pair.slice(0, pair.indexOf('=')), attributes };
  }

  it('scopes a Secure, Lax session cookie to the shared domain', async () => {
    const cookie = await sessionCookie('https://postbox-api.geoplanph.com', 'geoplanph.com');

    expect(cookie.name).toBe('__Secure-better-auth.session_token');
    expect(cookie.attributes).toEqual(
      expect.arrayContaining(['Domain=geoplanph.com', 'Secure', 'SameSite=Lax', 'HttpOnly']),
    );
  });

  it('leaves the localhost session cookie host-only', async () => {
    const cookie = await sessionCookie('http://localhost:8000', undefined);

    expect(cookie.name).toBe('better-auth.session_token');
    expect(cookie.attributes).toEqual(expect.arrayContaining(['SameSite=Lax', 'HttpOnly']));
    expect(cookie.attributes).not.toContain('Secure');
    expect(cookie.attributes.some((attribute) => attribute.startsWith('Domain='))).toBe(false);
  });
});
