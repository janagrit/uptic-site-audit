import { test, expect } from '../fixtures';
import { PAGES } from '../targets';

const HTTP_ERROR_THRESHOLD = 400;
const LINK_REQUEST_TIMEOUT_MS = 15_000;
// These sites block automated requests (e.g. LinkedIn returns 999), so check them by hand.
const BOT_BLOCKING_HOSTS = ['linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'];

function isBotBlocking(url: string): boolean {
  const host = new URL(url).hostname;
  return BOT_BLOCKING_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

for (const { name, path } of PAGES) {
  test(`Links — ${name}: no broken links`, async ({ basePage, page, request }) => {
    await basePage.open(path);
    const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href),
    );
    const uniqueHttpLinks = [...new Set(hrefs)].filter((href) => href.startsWith('http') && !isBotBlocking(href));

    const results = await Promise.all(
      uniqueHttpLinks.map(async (url) => {
        const res = await request
          .get(url, { maxRedirects: 5, failOnStatusCode: false, timeout: LINK_REQUEST_TIMEOUT_MS })
          .catch(() => null);
        return { url, status: res?.status() ?? 0 };
      }),
    );
    const broken = results
      .filter(({ status }) => status === 0 || status >= HTTP_ERROR_THRESHOLD)
      .map(({ url, status }) => `${status} ${url}`);

    expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([]);
  });
}
