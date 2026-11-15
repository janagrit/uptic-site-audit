import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, expectKnownIssue } from '../fixtures';
import { PAGES } from '../targets';

// Runs in the `mobile` project (Pixel 7: touch, mobile viewport and user agent).
// Reduced motion: the home page fades content in on scroll; measure the resting layout.
test.use({ reducedMotion: 'reduce' });

/** WCAG 1.4.10 reflow (320 CSS px), common phones, tablet portrait and landscape. */
const BREAKPOINTS = [320, 375, 414, 768, 1024] as const;
const BREAKPOINT_HEIGHT = 800;
/** iOS Safari zooms into text fields with a smaller font on focus, and does not zoom back out. */
const MIN_INPUT_FONT_PX = 16;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const target of PAGES) {
  const { name, path } = target;

  test(`Mobile — ${name}: no horizontal scroll`, async ({ basePage, page }) => {
    await basePage.open(path);
    const overflow = await horizontalOverflow(page);
    expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `screenshots/mobile-${name.replace(/\W+/g, '-')}.png`, fullPage: true });
  });

  test(`Mobile — ${name}: reflows without horizontal scroll at every breakpoint`, async ({ basePage, page }) => {
    const overflowing: string[] = [];
    for (const width of BREAKPOINTS) {
      await page.setViewportSize({ width, height: BREAKPOINT_HEIGHT });
      await basePage.open(path);
      const overflow = await horizontalOverflow(page);
      if (overflow > 0) overflowing.push(`${width}px: ${overflow}px too wide`);
    }
    expect(overflowing, overflowing.join('\n')).toEqual([]);
  });

  test(`Mobile — ${name}: touch targets are at least 24×24 px (WCAG 2.5.8)`, async ({ basePage, page }) => {
    expectKnownIssue(target, 'touch-targets');
    await basePage.open(path);

    // axe's target-size applies the WCAG exceptions (enough spacing, inline links in a sentence),
    // so links inside paragraphs are not false positives.
    const results = await new AxeBuilder({ page }).withRules(['target-size']).analyze();

    const small = results.violations.flatMap((v) => v.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary?.split('\n').at(-1)?.trim()}`));
    expect(small, small.join('\n')).toEqual([]);
  });
}

test.describe('Mobile — Contact form', () => {
  test.beforeEach(async ({ contactPage }) => {
    await contactPage.open();
  });

  test('every field fits the screen', async ({ page, contactPage }) => {
    const viewport = page.viewportSize()!;
    for (const field of [contactPage.nameInput, contactPage.hotelInput, contactPage.emailInput, contactPage.websiteInput, contactPage.messageInput, contactPage.submitButton]) {
      const name = (await field.getAttribute('name')) ?? 'submit';
      const box = await field.boundingBox();
      expect(box, `${name} is not rendered`).not.toBeNull();
      expect.soft(box!.x, `${name} starts off screen`).toBeGreaterThanOrEqual(0);
      expect.soft(box!.x + box!.width, `${name} runs off screen`).toBeLessThanOrEqual(viewport.width);
    }
  });

  test(`text fields use at least ${MIN_INPUT_FONT_PX}px text, so focusing them does not zoom the page`, async ({ contactPage }) => {
    for (const field of [contactPage.nameInput, contactPage.hotelInput, contactPage.emailInput, contactPage.websiteInput, contactPage.messageInput]) {
      const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect.soft(size, `${await field.getAttribute('name')}: ${size}px`).toBeGreaterThanOrEqual(MIN_INPUT_FONT_PX);
    }
  });

  test('fields bring up the right keyboard and autofill', async ({ contactPage }) => {
    await expect(contactPage.emailInput).toHaveAttribute('type', 'email');
    await expect(contactPage.emailInput).toHaveAttribute('autocomplete', 'email');
    await expect(contactPage.nameInput).toHaveAttribute('autocomplete', 'name');
    await expect(contactPage.websiteInput).toHaveAttribute('autocomplete', 'url');
  });

  test('tapping submit on an empty form shows validation, not a page load', async ({ page, contactPage, blockedWrites }) => {
    await contactPage.submitButton.tap();

    await expect(contactPage.nameInput).toHaveJSProperty('validity.valueMissing', true);
    await expect(page).toHaveURL(/\/contact\/$/);
    expect(blockedWrites).toEqual([]);
  });
});
