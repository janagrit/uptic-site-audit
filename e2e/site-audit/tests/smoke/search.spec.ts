import { test, expect, knownBug } from '../../fixtures';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

const HTTP_FORBIDDEN = 403;

test.describe('Smoke — Search', () => {
  test('returns matching results for a known term', async ({ searchPage }) => {
    await searchPage.open('revenue');

    await expect(searchPage.heading).toContainText('revenue');
    await expect(searchPage.resultTitles.filter({ hasText: 'Revenue Strategy' }).first()).toBeVisible();
  });

  test('search form submits a new query', async ({ searchPage, page }) => {
    await searchPage.open('revenue');

    await searchPage.searchFor('guest');

    await expect(page).toHaveURL(/[?&]s=guest/);
    await expect(searchPage.heading).toContainText('guest');
  });

  test('shows a no-results message for an unknown term', async ({ searchPage }) => {
    await searchPage.open('zzqxnomatch');

    await expect(searchPage.noResultsMessage).toBeVisible();
  });

  test('lists each result only once', async ({ searchPage }) => {
    await searchPage.open('revenue');

    const titles = await searchPage.resultTitles.allInnerTexts();

    expect(titles).toEqual([...new Set(titles)]);
  });

  test('shows markup in a query as text', async ({ searchPage, page }) => {
    // No event handler or <img>: the CDN firewall lets this through, so WordPress's own escaping is tested.
    const payload = '"><b id=xss-probe>probe</b>';

    await searchPage.open(payload);

    await expect(searchPage.heading).toContainText('<b id=xss-probe>');
    await expect(page.locator('#xss-probe')).toHaveCount(0);
  });

  test('shows a script-like query as text instead of running it', async ({ searchPage, page }) => {
    const payload = '"><img src=x id=xss-probe onerror="window.__xss=1">';

    const response = await searchPage.open(payload);

    // Since 2026-10-28 the CDN firewall (hcdn) answers 403 before WordPress sees the query (FINDINGS.md, Platform).
    if (response?.status() !== HTTP_FORBIDDEN) {
      await expect(searchPage.heading).toContainText('<img src=x');
    }
    await expect(page.locator('#xss-probe')).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('results show short excerpts, not full page content', async ({ searchPage }) => {
    await searchPage.open('revenue');

    await expect(searchPage.resultFullContent).toHaveCount(0);
  });

  test('article page offers a search box', async ({ articlePage, page }) => {
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

    await expect(page.getByRole('search')).toBeVisible();
  });

  test('home page offers a search box', async ({ homePage, page }) => {
    knownBug('FINDINGS #11: no search UI on the home page');
    await homePage.open();

    await expect(page.getByRole('search')).toBeVisible();
  });
});
