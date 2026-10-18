import { test, expect } from '../../fixtures';

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
    test.fail(true, 'Known site defect — FINDINGS #21: results template has no "No results" block; an empty search shows only "More posts"');
    await searchPage.open('zzqxnomatch');

    await expect(searchPage.noResultsMessage).toBeVisible();
  });

  test('lists each result only once', async ({ searchPage }) => {
    await searchPage.open('revenue');

    const titles = await searchPage.resultTitles.allInnerTexts();

    expect(titles).toEqual([...new Set(titles)]);
  });

  test('shows a script-like query as text instead of running it', async ({ searchPage, page }) => {
    const payload = '"><img src=x id=xss-probe onerror="window.__xss=1">';

    await searchPage.open(payload);

    await expect(searchPage.heading).toContainText('<img src=x');
    await expect(page.locator('#xss-probe')).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('results show short excerpts, not full page content', async ({ searchPage }) => {
    await searchPage.open('revenue');

    await expect(searchPage.resultFullContent).toHaveCount(0);
  });

  test('home page offers a search box', async ({ homePage, page }) => {
    test.fail(true, 'Known site defect — FINDINGS #11: no search UI outside the results page');
    await homePage.open();

    await expect(page.getByRole('search')).toBeVisible();
  });
});
