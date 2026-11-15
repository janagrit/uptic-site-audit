import type { Page, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';

/**
 * Determinism for screenshot tests. A visual diff should only fire when the site changed, so
 * before every screenshot:
 *
 * - motion is off (`reducedMotion: 'reduce'` in the spec, plus `animations: 'disabled'` here)
 * - web fonts have loaded (a fallback font reflows every line)
 * - images in the viewport have decoded (a half-loaded hero is a different picture)
 * - the page is scrolled to the top and the caret is hidden
 *
 * Baselines are per OS (`-darwin.png` locally, `-linux.png` in CI) because font rendering differs.
 * Screenshots are of stable components or the first viewport, never full pages whose length
 * changes whenever an article is published.
 */

/** Small tolerance for anti-aliasing; anything layout-sized still fails. */
export const MAX_DIFF_PIXEL_RATIO = 0.01;

export const SCREENSHOT_OPTIONS: PageAssertionsToHaveScreenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
  maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
};

export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.images]
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && img.loading !== 'lazy';
      })
      .every((img) => img.complete && img.naturalWidth > 0),
  );
}
