import { test, expect } from '../../fixtures';
import { ADMIN_AJAX, ARTICLE_VIEW_ACTION, formBody, isAction } from '../../network/endpoints';
import { interceptAction } from '../../network/mocks';
import { VIEW_DELAY_MS } from '../../page-objects/ArticlePage';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

// views.js (uptic-insights) POSTs one view to admin-ajax after 5 s of visibility,
// unless Global Privacy Control or Do Not Track is on. The clock is faked to avoid real waits.
const VIEW_OK = { contentType: 'application/json', body: '{"success":true}' };
const CLOCK_START = new Date('2026-01-01T09:00:00Z');
const REAL_TIME_PROBE_MS = 1_000;

test.describe('E2E — Article view counter', () => {
  test.beforeEach(async ({ page }) => {
    // An installed clock still ticks in real time; on a slow machine the 5 s timer fired before
    // the test's own runFor. Pausing makes page time move only when the test advances it.
    await page.clock.install({ time: CLOCK_START });
    await page.clock.pauseAt(CLOCK_START);
  });

  test('sends one view with the page id and token after 5 seconds', async ({ page, articlePage }) => {
    const views = await interceptAction(page, ADMIN_AJAX, ARTICLE_VIEW_ACTION, VIEW_OK);
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);
    const config = await articlePage.viewTrackingConfig();

    await page.clock.runFor(VIEW_DELAY_MS - 1_000);
    expect(views.requests).toHaveLength(0);

    await page.clock.runFor(1_000);
    await expect.poll(() => views.requests.length).toBe(1);
    expect(Object.fromEntries(formBody(views.requests[0]))).toEqual({
      action: ARTICLE_VIEW_ACTION,
      id: config.id,
      day: config.day,
      token: config.token,
    });

    await page.clock.runFor(VIEW_DELAY_MS * 3);
    expect(views.requests).toHaveLength(1);
  });

  const PRIVACY_SIGNALS = [
    { name: 'Global Privacy Control', script: () => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }) },
    { name: 'Do Not Track', script: () => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }) },
  ];

  for (const signal of PRIVACY_SIGNALS) {
    test(`sends no view when ${signal.name} is on`, async ({ page, articlePage, blockedWrites }) => {
      await page.addInitScript(signal.script);
      const views = await interceptAction(page, ADMIN_AJAX, ARTICLE_VIEW_ACTION, VIEW_OK);
      await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

      await page.clock.runFor(VIEW_DELAY_MS * 2);
      await page.waitForLoadState('networkidle');

      expect(views.requests).toHaveLength(0);
      expect(blockedWrites).toHaveLength(0);
    });
  }

  test('sends no view from a background tab', async ({ page, articlePage, blockedWrites }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { get: () => true });
    });
    const views = await interceptAction(page, ADMIN_AJAX, ARTICLE_VIEW_ACTION, VIEW_OK);
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

    await page.clock.runFor(VIEW_DELAY_MS * 2);
    await page.waitForLoadState('networkidle');

    expect(views.requests).toHaveLength(0);
    expect(blockedWrites).toHaveLength(0);
  });

  test('a failed view request raises no page error', async ({ page, articlePage, pageErrors }) => {
    const attempts: string[] = [];
    await page.route(ADMIN_AJAX, async (route) => {
      if (!isAction(route.request(), ARTICLE_VIEW_ACTION)) {
        return route.fallback();
      }
      attempts.push(route.request().url());
      await route.abort('connectionreset');
    });
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

    await page.clock.runFor(VIEW_DELAY_MS);
    await expect.poll(() => attempts.length).toBe(1);
    await page.waitForLoadState('networkidle');

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });

  test('BUG-R1 regression: page time moves only when the test advances it', async ({ page, articlePage }) => {
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);
    const before = await page.evaluate(() => Date.now());

    // Deliberate real-time wait: the bug was page time advancing on its own while the test ran.
    await new Promise((resolve) => setTimeout(resolve, REAL_TIME_PROBE_MS));

    expect(await page.evaluate(() => Date.now())).toBe(before);
  });

  test('write guard aborts the view when no test intercepts it', async ({ page, articlePage, blockedWrites }) => {
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

    await page.clock.runFor(VIEW_DELAY_MS);

    await expect.poll(() => blockedWrites.map((write) => write.action)).toEqual([ARTICLE_VIEW_ACTION]);
  });
});
