import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures';
import { PAGES } from '../targets';

const HTTP_ERROR_THRESHOLD = 400;
const LINK_REQUEST_TIMEOUT_MS = 15_000;
// These sites block automated requests (e.g. LinkedIn returns 999), so check them by hand.
const BOT_BLOCKING_HOSTS = ['linkedin.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com'];

const LINK_CONCURRENCY = 6;

interface LinkResult {
  readonly url: string;
  readonly status: number;
  /** Set when no HTTP response arrived (timeout, reset, DNS); reported instead of a bare 0. */
  readonly error?: string;
}

async function checkLink(request: APIRequestContext, url: string): Promise<LinkResult> {
  try {
    const res = await request.get(url, { maxRedirects: 5, failOnStatusCode: false, timeout: LINK_REQUEST_TIMEOUT_MS });
    return { url, status: res.status() };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { url, status: 0, error: message };
  }
}

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

    const results: LinkResult[] = [];
    // A few at a time: firing every link at once added load to a slow site and failed every request.
    for (let i = 0; i < uniqueHttpLinks.length; i += LINK_CONCURRENCY) {
      const batch = uniqueHttpLinks.slice(i, i + LINK_CONCURRENCY);
      results.push(...(await Promise.all(batch.map((url) => checkLink(request, url)))));
    }
    const broken = results
      .filter(({ status, error }) => error !== undefined || status >= HTTP_ERROR_THRESHOLD)
      .map(({ url, status, error }) => (error ? `network error (${error}) ${url}` : `${status} ${url}`));

    expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([]);
  });
}
