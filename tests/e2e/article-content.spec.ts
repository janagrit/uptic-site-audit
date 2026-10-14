import { test, expect } from '../../fixtures';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

// API ↔ UI consistency: what the REST API says about a post is what the page shows.
test.describe('E2E — Article matches the API', () => {
  test('page shows the title the API returns', async ({ page, wpApi, articlePage }) => {
    const post = await wpApi.postBySlug(SAMPLE_ARTICLE_SLUG);
    expect(post, `${SAMPLE_ARTICLE_SLUG} missing from the API`).toBeDefined();

    await articlePage.openBySlug(SAMPLE_ARTICLE_SLUG);
    const apiTitle = await page.evaluate((html) => {
      const el = document.createElement('textarea');
      el.innerHTML = html;
      return el.value;
    }, post!.title.rendered);

    await expect(page.locator('.wp-block-post-title')).toHaveText(apiTitle);
  });
});
