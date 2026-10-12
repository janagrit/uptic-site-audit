import { test, expect } from '../../fixtures';

test.describe('Smoke — Navigation (mobile)', () => {
  test('Menu button opens the drawer', async ({ homePage, siteHeader }) => {
    await homePage.open();

    await siteHeader.openMobileMenu();

    await expect(siteHeader.menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(siteHeader.mobileDrawer).toBeVisible();
  });

  test('drawer link navigates to Insights', async ({ homePage, siteHeader, page }) => {
    await homePage.open();
    await siteHeader.openMobileMenu();

    await siteHeader.mobileDrawer.getByRole('link', { name: 'Insights', exact: true }).click();

    await expect(page).toHaveURL(/\/insights\/$/);
  });
});
