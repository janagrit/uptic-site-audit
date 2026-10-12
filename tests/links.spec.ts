import { test, expect } from '@playwright/test';
import { PAGES } from '../pages';

const HTTP_ERROR_THRESHOLD = 400;
// These sites block automated requests (e.g. LinkedIn returns 999), so check them by hand.
const BOT_BLOCKING_HOSTS = ['linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'];

function isBotBlocking(url: string): boolean {
  const host = new URL(url).hostname;
  return BOT_BLOCKING_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

for (const { name, path } of PAGES) {
  test(`Links — ${name}: no broken links`, async ({ page, request }) => {
    await page.goto(path);
    const hrefs = await page.locator('a[href]').evaluateAll((anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href),
    );
    const uniqueHttpLinks = [...new Set(hrefs)].filter((href) => href.startsWith('http') && !isBotBlocking(href));

    const broken: string[] = [];
    for (const url of uniqueHttpLinks) {
      const res = await request.get(url, { maxRedirects: 5, failOnStatusCode: false }).catch(() => null);
      const status = res?.status() ?? 0;
      if (status === 0 || status >= HTTP_ERROR_THRESHOLD) {
        broken.push(`${status} ${url}`);
      }
    }
    expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([]);
  });
}
