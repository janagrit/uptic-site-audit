import { test, expect } from '../../fixtures';
import { ADMIN_AJAX, ARTICLE_VIEW_ACTION, formBody } from '../../network/endpoints';
import { interceptAction } from '../../network/mocks';
import { VIEW_DELAY_MS } from '../../page-objects/ArticlePage';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

// views.js (uptic-insights) POSTs one view to admin-ajax after 5 s of visibility,
// unless Global Privacy Control or Do Not Track is on. The clock is faked to avoid real waits.
const VIEW_OK = { contentType: 'application/json', body: '{"success":true}' };

test.describe('E2E — Article view counter', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
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

  test('write guard aborts the view when no test intercepts it', async ({ page, articlePage, blockedWrites }) => {
    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);

    await page.clock.runFor(VIEW_DELAY_MS);

    await expect.poll(() => blockedWrites.map((write) => write.action)).toEqual([ARTICLE_VIEW_ACTION]);
  });
});
