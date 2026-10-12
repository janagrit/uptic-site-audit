import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGES } from '../pages';

for (const { name, path } of PAGES) {
  test.describe(`Accessibility — ${name}`, () => {
    test('no WCAG 2.2 AA violations (axe)', async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const summary = results.violations.map(
        (v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} element(s))`,
      );
      expect(results.violations, summary.join('\n')).toEqual([]);
    });

    test('every image has alt text', async ({ page }) => {
      await page.goto(path);
      const missing = await page.locator('img:not([alt])').evaluateAll((imgs) =>
        imgs.map((img) => (img as HTMLImageElement).src),
      );
      expect(missing, `images without alt:\n${missing.join('\n')}`).toEqual([]);
    });
  });
}
