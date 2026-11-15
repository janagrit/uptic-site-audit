/**
 * URL handling for the site under test. Pure functions only (no env, no I/O), unit tested in
 * tests/unit/url.spec.ts.
 *
 * Why not rely on Playwright's `baseURL` alone? It resolves with `new URL(path, baseURL)`, so a
 * root-relative path ("/contact/") drops any path in the base: `https://host/staging/` + `/contact/`
 * becomes `https://host/contact/`. Every navigation and request in the suite goes through `joinUrl()`.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Validates a base URL and returns it in one canonical form: lower-case host, no query, no hash,
 * no credentials, and exactly one trailing slash (`https://host/` or `https://host/sub/`).
 */
export function normalizeBaseUrl(raw: string, variable = 'BASE_URL'): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${variable} is not a valid absolute URL: "${raw}"`);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new ConfigError(`${variable} must use http or https, got "${url.protocol}" in "${raw}"`);
  }
  if (url.username || url.password) {
    throw new ConfigError(`${variable} must not contain credentials`);
  }
  if (url.search || url.hash) {
    throw new ConfigError(`${variable} must not contain a query or fragment: "${raw}"`);
  }
  // Collapse duplicate slashes in the path and end it with exactly one slash.
  const path = `${url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')}/`;
  return `${url.origin}${path}`;
}

/**
 * Joins a site path to a base URL, keeping the base's path prefix.
 * `joinUrl('https://host/sub/', '/contact/')` → `https://host/sub/contact/`.
 * Query-only paths (`/?s=x`, `?s=x`) attach to the base path. Absolute URLs are returned unchanged.
 */
export function joinUrl(baseUrl: string, path: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base).href;
}
