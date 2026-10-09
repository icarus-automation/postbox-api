import type { BetterAuthAdvancedOptions } from 'better-auth';

// Cookie settings for Better Auth, kept out of auth.ts so main.ts can report an
// unused COOKIE_DOMAIN without constructing the auth instance.

export type CookieSettings = Pick<
  BetterAuthAdvancedOptions,
  'useSecureCookies' | 'crossSubDomainCookies' | 'defaultCookieAttributes'
>;

/**
 * The domain Better Auth cookies are scoped to, or undefined for host-only cookies.
 * COOKIE_DOMAIN counts only when BETTER_AUTH_URL is https and its host is that domain
 * or a subdomain of it. A browser drops a cookie whose domain does not cover the host
 * that set it, so localhost keeps host-only cookies even when the env file carries the
 * production domain.
 */
export function sharedCookieDomain(
  baseURL: string,
  cookieDomain: string | undefined,
): string | undefined {
  if (!cookieDomain) return undefined;

  const domain = cookieDomain.trim().replace(/^\./, '').toLowerCase();
  const { protocol, hostname } = new URL(baseURL);
  const covered = hostname === domain || hostname.endsWith(`.${domain}`);

  return protocol === 'https:' && covered ? domain : undefined;
}

/**
 * With a shared domain, the session cookie reaches the client and the API on sibling
 * subdomains, such as postbox.geoplanph.com and postbox-api.geoplanph.com. Secure and
 * SameSite come from this config rather than from the request, so the plain HTTP hop
 * from the proxy to the API cannot drop them. Without a shared domain, Better Auth
 * keeps the host-only cookies localhost needs.
 */
export function cookieSettings(domain: string | undefined): CookieSettings {
  if (!domain) return {};

  return {
    useSecureCookies: true,
    crossSubDomainCookies: { enabled: true, domain },
    defaultCookieAttributes: { secure: true, sameSite: 'lax' },
  };
}
