import { test, expect } from '../fixtures';
import { BASE_URL, PAGES } from '../targets';

const SITE_ORIGIN = new URL(BASE_URL).origin;
// Requests the write guard aborts on purpose are not asset failures.
const BLOCKED_BY_GUARD = 'net::ERR_BLOCKED_BY_CLIENT';

for (const target of PAGES) {
  test.describe(`Page health — ${target.name}`, () => {
    test('every same-origin asset loads', async ({ page, basePage }) => {
      const failures: string[] = [];
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.origin === SITE_ORIGIN && response.status() >= 400) {
          failures.push(`${response.status()} ${response.request().resourceType()} ${url.pathname}${url.search}`);
        }
      });
      page.on('requestfailed', (request) => {
        const url = new URL(request.url());
        const reason = request.failure()?.errorText ?? 'unknown';
        if (url.origin === SITE_ORIGIN && reason !== BLOCKED_BY_GUARD) {
          failures.push(`${reason} ${request.resourceType()} ${url.pathname}`);
        }
      });

      await basePage.open(target.path);
      await page.waitForLoadState('networkidle');

      expect(failures, failures.join('\n')).toEqual([]);
    });

    test('throws no uncaught JavaScript errors', async ({ page, basePage, pageErrors }) => {
      await basePage.open(target.path);
      await page.waitForLoadState('networkidle');

      expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    });
  });
}
