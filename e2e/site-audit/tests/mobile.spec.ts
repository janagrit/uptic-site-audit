import { test, expect } from '../fixtures';
import { PAGES } from '../targets';

for (const { name, path } of PAGES) {
  test(`Mobile — ${name}: no horizontal scroll`, async ({ basePage, page }) => {
    await basePage.open(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `screenshots/mobile-${name.replace(/\W+/g, '-')}.png`, fullPage: true });
  });
}
