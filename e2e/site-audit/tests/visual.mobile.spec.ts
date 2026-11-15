import { test, expect } from '../fixtures';
import { SCREENSHOT_OPTIONS, settle } from '../audits/visual';

// Mobile project (Pixel 7). Baselines in tests/visual.mobile.spec.ts-snapshots/, per OS like visual.spec.ts.

test.use({ reducedMotion: 'reduce' });

test.describe('Visual — Mobile', () => {
  test('home above the fold matches the baseline', async ({ homePage, page }) => {
    await homePage.open();
    await settle(page);

    await expect(page).toHaveScreenshot('home-mobile.png', SCREENSHOT_OPTIONS);
  });

  test('open navigation drawer matches the baseline', async ({ homePage, siteHeader, page }) => {
    await homePage.open();
    await settle(page);
    await siteHeader.openMobileMenu();
    await expect(siteHeader.mobileDrawer).toBeVisible();

    await expect(siteHeader.mobileDrawer).toHaveScreenshot('nav-drawer.png', SCREENSHOT_OPTIONS);
  });
});
