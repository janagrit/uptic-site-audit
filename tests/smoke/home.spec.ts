import { test, expect } from '../../fixtures';

test.describe('Smoke — Home', () => {
  test('loads successfully with the hero heading', async ({ homePage }) => {
    const response = await homePage.open();

    expect(response?.status()).toBe(200);
    await expect(homePage.heroHeading).toBeVisible();
    await expect(homePage.heroHeading).toContainText('Hotels move forward');
  });

  test('has a "Start a conversation" call to action', async ({ homePage }) => {
    await homePage.open();

    await expect(homePage.contactCta).toBeVisible();
    await expect(homePage.contactCta).toHaveAttribute('href', /.+/);
  });

  test('loads without JavaScript errors', async ({ homePage, pageErrors }) => {
    await homePage.open();

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});
