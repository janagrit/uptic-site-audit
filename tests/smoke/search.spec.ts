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
    await searchPage.open('zzqxnomatch');

    await expect(searchPage.noResultsMessage).toBeVisible();
  });

  test('lists each result only once', async ({ searchPage }) => {
    test.fail(true, 'Known site defect — FINDINGS #12: search results are duplicated');
    await searchPage.open('revenue');

    const titles = await searchPage.resultTitles.allInnerTexts();

    expect(titles).toEqual([...new Set(titles)]);
  });

  test('home page offers a search box', async ({ homePage, page }) => {
    test.fail(true, 'Known site defect — FINDINGS #11: no search UI outside the results page');
    await homePage.open();

    await expect(page.getByRole('search')).toBeVisible();
  });
});
