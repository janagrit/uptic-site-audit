import { test, expect } from '../fixtures';

// Baselines live in tests/visual.spec.ts-snapshots/, one per OS (fonts render differently).
// After an intentional site change, refresh them with: npm run test:visual:update
const MAX_DIFF_PIXEL_RATIO = 0.01;

test.describe('Visual — Home', () => {
  test('above-the-fold hero matches the baseline', async ({ homePage, page }) => {
    await homePage.open();
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('home-hero.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    });
  });
});
