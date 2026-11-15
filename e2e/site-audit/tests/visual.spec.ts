import { test, expect } from '../fixtures';
import { SCREENSHOT_OPTIONS, settle } from '../audits/visual';
import { SAMPLE_ARTICLE_SLUG } from '../targets';

// Baselines live in tests/visual.spec.ts-snapshots/, one per OS (fonts render differently): darwin locally, linux in CI.
// After an intentional site change, refresh both: npm run test:visual:update and npm run test:visual:update:linux.
// To add a new screenshot without touching existing ones: npx playwright test tests/visual --update-snapshots=missing
// How the screenshots are kept deterministic: audits/visual.ts.

test.use({ reducedMotion: 'reduce' });

test.describe('Visual — Home', () => {
  test('above-the-fold hero matches the baseline', async ({ homePage, page }) => {
    await homePage.open();
    await settle(page);

    await expect(page).toHaveScreenshot('home-hero.png', SCREENSHOT_OPTIONS);
  });
});

test.describe('Visual — Components', () => {
  test('header navigation matches the baseline', async ({ homePage, siteHeader, page }) => {
    await homePage.open();
    await settle(page);

    await expect(siteHeader.mainNav).toHaveScreenshot('header-nav.png', SCREENSHOT_OPTIONS);
  });

  test('open Services menu matches the baseline', async ({ homePage, siteHeader, page }) => {
    await homePage.open();
    await settle(page);
    await siteHeader.servicesToggle.click();

    await expect(siteHeader.mainNav.locator('details[open]')).toHaveScreenshot('header-services-open.png', SCREENSHOT_OPTIONS);
  });

  test('contact form matches the baseline', async ({ contactPage, page }) => {
    await contactPage.open();
    await settle(page);

    await expect(contactPage.form).toHaveScreenshot('contact-form.png', SCREENSHOT_OPTIONS);
  });

  test('filled-in contact form matches the baseline', async ({ contactPage, page }) => {
    await contactPage.open();
    await settle(page);
    await contactPage.fill({ name: 'Visual Test', hotel: 'Test Hotel', email: 'qa@example.com', services: ['Guest Journey'], message: 'Visual regression check.' });

    await expect(contactPage.form).toHaveScreenshot('contact-form-filled.png', SCREENSHOT_OPTIONS);
  });
});

test.describe('Visual — Article', () => {
  test('article above the fold matches the baseline', async ({ articlePage, page }) => {
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);
    await settle(page);

    await expect(page).toHaveScreenshot('article-above-fold.png', SCREENSHOT_OPTIONS);
  });
});

test.describe('Visual — Tablet breakpoint', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('home above the fold at 768px matches the baseline', async ({ homePage, page }) => {
    await homePage.open();
    await settle(page);

    await expect(page).toHaveScreenshot('home-tablet.png', SCREENSHOT_OPTIONS);
  });
});
