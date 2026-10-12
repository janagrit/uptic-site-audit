import { test, expect } from '@playwright/test';
import { PAGES } from '../pages';

for (const { name, path } of PAGES) {
  test(`Mobile — ${name}: no horizontal scroll`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `screenshots/mobile-${name.replace(/\W+/g, '-')}.png`, fullPage: true });
  });
}
