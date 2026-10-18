import { apiTest as test, expect } from '../../fixtures';
import { BASE_URL, PRODUCTION_URL } from '../../targets';

const CANONICAL_HOME = `${PRODUCTION_URL}/`;
const NON_CANONICAL_HOMES: readonly string[] = ['http://uptichospitality.com/', 'https://www.uptichospitality.com/'];

/** `<loc>` values from a sitemap or sitemap index. */
function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
}

test.describe('API — Site', () => {
  for (const url of NON_CANONICAL_HOMES) {
    test(`${url} redirects permanently to the canonical https apex`, async ({ request }) => {
      test.skip(BASE_URL !== PRODUCTION_URL, 'Host redirects only exist on production');

      const response = await request.get(url, { maxRedirects: 0 });

      expect(response.status()).toBe(301);
      expect(response.headers()['location']).toBe(CANONICAL_HOME);
    });
  }

  test('sitemap lists only URLs that load', async ({ request }) => {
    const index = await request.get('/sitemap.xml');
    expect(index.status()).toBe(200);

    const sitemaps = locs(await index.text());
    expect(sitemaps.length, 'sitemap index lists no sitemaps').toBeGreaterThan(0);
    const urls: string[] = [];
    for (const sitemap of sitemaps) {
      const response = await request.get(sitemap);
      expect.soft(response.status(), sitemap).toBe(200);
      urls.push(...locs(await response.text()));
    }

    expect(urls.length, 'sitemaps list no pages').toBeGreaterThan(0);
    for (const url of urls) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect.soft(response.status(), url).toBe(200);
    }
  });
});
