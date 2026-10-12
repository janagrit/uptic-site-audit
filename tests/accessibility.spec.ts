import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures';
import { PAGES } from '../targets';

for (const { name, path } of PAGES) {
  test.describe(`Accessibility — ${name}`, () => {
    test.beforeEach(async ({ basePage }) => {
      await basePage.open(path);
    });

    test('no WCAG 2.2 AA violations (axe)', async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const summary = results.violations.map(
        (v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} element(s))`,
      );
      expect(results.violations, summary.join('\n')).toEqual([]);
    });

    test('every image has alt text', async ({ page }) => {
      const missing = await page.locator('img:not([alt])').evaluateAll((imgs) =>
        imgs.map((img) => (img as HTMLImageElement).src),
      );
      expect(missing, `images without alt:\n${missing.join('\n')}`).toEqual([]);
    });
  });
}
