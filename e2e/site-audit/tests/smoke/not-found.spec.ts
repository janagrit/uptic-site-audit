import { test, expect } from '../../fixtures';

const MISSING_PATH = '/zzqx-no-such-page/';

test.describe('Smoke — Not found', () => {
  test('an unknown URL returns a real 404 that search engines skip', async ({ basePage, page }) => {
    const response = await basePage.open(MISSING_PATH);

    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});
