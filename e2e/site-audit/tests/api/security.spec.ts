import type { APIResponse } from '@playwright/test';
import { apiTest as test, expect, knownBug, requirePlatform } from '../../fixtures';
import { parseContract, restIndexSchema } from '../../api/schemas';
import { PAGES, siteUrl } from '../../targets';

// Every probe here is a GET (the `request` fixture refuses anything else). Payloads that look
// hostile are inert markup sent in a query string or path, never stored anywhere.

const ONE_YEAR_S = 31_536_000;

const REQUIRED_HEADERS: readonly { name: string; ok: (headers: Record<string, string>) => boolean }[] = [
  { name: 'Strict-Transport-Security', ok: (h) => /max-age=\d+/.test(h['strict-transport-security'] ?? '') },
  { name: 'X-Content-Type-Options: nosniff', ok: (h) => h['x-content-type-options'] === 'nosniff' },
  {
    name: 'framing protection (X-Frame-Options or CSP frame-ancestors)',
    ok: (h) => Boolean(h['x-frame-options']) || /frame-ancestors/.test(h['content-security-policy'] ?? ''),
  },
];

/** `script-src` (or the `default-src` fallback) of a CSP header, or undefined when neither is set. */
function scriptSources(csp: string | undefined): string | undefined {
  const directives = new Map(
    (csp ?? '')
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name.toLowerCase(), values.join(' ')] as const),
  );
  return directives.get('script-src') ?? directives.get('default-src');
}

async function pageHeaders(request: { get(url: string): Promise<APIResponse> }): Promise<{ page: string; headers: Record<string, string>; cookies: string[] }[]> {
  const results = [];
  for (const target of PAGES) {
    const response = await request.get(siteUrl(target.path));
    const cookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
    results.push({ page: target.name, headers: response.headers(), cookies });
  }
  return results;
}

test.describe('API — Security', () => {
  test('REST API does not list user accounts publicly', async ({ wpApi }) => {
    requirePlatform('wordpress');
    const response = await wpApi.usersResponse();

    const users = response.ok() ? ((await response.json()) as unknown[]) : [];
    expect(users, `${users.length} user(s) exposed`).toEqual([]);
  });

  test('home page sends the baseline security headers', async ({ request }) => {
    const response = await request.get(siteUrl('/'));
    const headers = response.headers();

    const missing = REQUIRED_HEADERS.filter((header) => !header.ok(headers)).map((header) => header.name);
    expect(missing, `missing: ${missing.join(', ')}`).toEqual([]);
  });
});

test.describe('API — Security headers on every audited page', () => {
  test('HSTS lasts at least a year', async ({ request }) => {
    for (const { page, headers } of await pageHeaders(request)) {
      const maxAge = Number(/max-age=(\d+)/.exec(headers['strict-transport-security'] ?? '')?.[1] ?? 0);
      expect.soft(maxAge, `${page}: ${headers['strict-transport-security'] ?? 'no HSTS header'}`).toBeGreaterThanOrEqual(ONE_YEAR_S);
    }
  });

  test('every page sends nosniff and framing protection', async ({ request }) => {
    for (const { page, headers } of await pageHeaders(request)) {
      const missing = REQUIRED_HEADERS.filter((header) => !header.ok(headers)).map((header) => header.name);
      expect.soft(missing, `${page} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });

  test('Content-Security-Policy restricts where scripts load from', async ({ request }) => {
    knownBug('FINDINGS #22: CSP only sets frame-ancestors; no script-src or default-src');
    for (const { page, headers } of await pageHeaders(request)) {
      const csp = 'content-security-policy' in headers ? headers['content-security-policy'] : undefined;
      const scripts = scriptSources(csp);
      expect.soft(scripts, `${page}: CSP "${csp ?? '(none)'}" has no script-src or default-src`).toBeDefined();
      // 'unsafe-inline' without a nonce or hash cancels the XSS protection a CSP exists for.
      if (scripts && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scripts)) {
        expect.soft(scripts, `${page}: script-src allows 'unsafe-inline'`).not.toContain("'unsafe-inline'");
      }
    }
  });

  test('responses do not advertise server software versions', async ({ request }) => {
    knownBug('FINDINGS #23: X-Powered-By discloses the PHP version');
    for (const { page, headers } of await pageHeaders(request)) {
      for (const name of ['x-powered-by', 'server']) {
        expect.soft(headers[name] ?? '', `${page}: ${name}: ${headers[name]}`).not.toMatch(/\d+\.\d+/);
      }
    }
  });

  test('cookies are Secure and SameSite; session cookies are HttpOnly', async ({ request }) => {
    const all = (await pageHeaders(request)).flatMap(({ page, cookies }) => cookies.map((cookie) => ({ page, cookie })));
    test.info().annotations.push({ type: 'cookies', description: all.length === 0 ? 'no cookies set to anonymous visitors' : `${all.length} cookie(s) checked` });

    for (const { page, cookie } of all) {
      const name = cookie.split('=')[0];
      expect.soft(cookie, `${page}: ${name} lacks Secure`).toMatch(/;\s*secure/i);
      expect.soft(cookie, `${page}: ${name} lacks SameSite`).toMatch(/;\s*samesite=/i);
      if (/sess|auth|token|logged_in|wordpress_sec/i.test(name)) {
        expect.soft(cookie, `${page}: session cookie ${name} lacks HttpOnly`).toMatch(/;\s*httponly/i);
      }
    }
  });
});

test.describe('API — WordPress exposure', () => {
  test.beforeEach(() => {
    requirePlatform('wordpress');
  });

  test('the REST index registers no user listing or lookup routes', async ({ wpApi }) => {
    const response = await wpApi.getRaw('/wp-json/');
    const index = parseContract(restIndexSchema, await response.json(), 'REST index');

    // `/users/me` and application-password routes stay: they need a login (checked below).
    // The listing (`/users`) and lookup by id (`/users/(?P<id>…)`) are what enumerate accounts.
    const enumerating = Object.keys(index.routes).filter((route) => route === '/wp/v2/users' || route.startsWith('/wp/v2/users/(?P<id>'));
    expect(enumerating).toEqual([]);
  });

  for (const route of ['/wp-json/wp/v2/users/me', '/wp-json/wp/v2/settings', '/wp-json/wp/v2/plugins', '/wp-json/wp/v2/themes', '/?rest_route=/wp/v2/users']) {
    test(`${route} refuses anonymous readers`, async ({ wpApi }) => {
      const response = await wpApi.getRaw(route);

      expect([401, 403, 404], `HTTP ${response.status()}`).toContain(response.status());
    });
  }

  test('author archives do not reveal an email-derived login (FINDINGS #17 regression)', async ({ request }) => {
    // `?author=N` redirects to the author's archive slug. Public by WordPress design, so the check is
    // that the slug no longer derives from an email address. Whether it equals the login name needs a
    // manual check in wp-admin (docs/MANUAL-CHECKS.md).
    const response = await request.get(siteUrl('/?author=1'), { maxRedirects: 0 });
    const slug = /\/author\/([^/]+)\/?$/.exec(response.headers()['location'] ?? '')?.[1] ?? '';

    expect(slug, `author slug "${slug}"`).not.toMatch(/(gmail|outlook|hotmail|yahoo|icloud)-com|@|%40/i);
  });
});

test.describe('API — Input handling', () => {
  test('the 404 page shows markup from the URL as text', async ({ request }) => {
    const response = await request.get(siteUrl('/zzqx-%3Cb%20id%3Dprobe%3Eprobe%3C%2Fb%3E/'));

    // The CDN firewall may answer 403 first (FINDINGS.md, Platform); either way nothing is reflected raw.
    expect([403, 404]).toContain(response.status());
    expect(await response.text()).not.toContain('<b id=probe>');
  });

  test('REST errors echo hostile parameters as JSON, never as HTML', async ({ wpApi }) => {
    requirePlatform('wordpress');
    const response = await wpApi.get('/posts', { orderby: '<b id=probe>x</b>' });

    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toMatch(/^application\/json/);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  });
});
