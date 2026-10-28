import { apiTest as test, expect } from '../../fixtures';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

const MAX_PER_PAGE = 100;

test.describe('API — wp/v2/posts', () => {
  test('returns published posts that match the schema', async ({ wpApi }) => {
    const posts = await wpApi.posts({ per_page: MAX_PER_PAGE });

    expect(posts.length).toBeGreaterThan(0);
  });

  test('reports the total in headers and fits on one page', async ({ wpApi }) => {
    const response = await wpApi.postsResponse({ per_page: MAX_PER_PAGE });

    const total = Number(response.headers()['x-wp-total']);
    expect(total).toBeGreaterThan(0);
    expect(total, 'add pagination to WpApi.posts once the blog passes 100 posts').toBeLessThanOrEqual(MAX_PER_PAGE);
  });

  test('finds the sample article by slug', async ({ wpApi }) => {
    const post = await wpApi.postBySlug(SAMPLE_ARTICLE_SLUG);

    expect(post?.link).toMatch(new RegExp(`/${SAMPLE_ARTICLE_SLUG}/$`));
  });

  test('returns an empty list for an unknown slug', async ({ wpApi }) => {
    expect(await wpApi.posts({ slug: 'zzqx-no-such-post' })).toEqual([]);
  });

  test('rejects an out-of-range page size with a JSON 400', async ({ wpApi }) => {
    const response = await wpApi.postsResponse({ per_page: MAX_PER_PAGE + 1 });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'rest_invalid_param', data: { status: 400 } });
  });

  test('every published post link loads', async ({ wpApi, request }) => {
    const posts = await wpApi.posts({ per_page: MAX_PER_PAGE, _fields: 'id,slug,status,link,date_gmt,title,excerpt' });

    for (const post of posts) {
      const response = await request.get(post.link);
      expect.soft(response.status(), post.link).toBe(200);
    }
  });
});
