import { apiTest as test, expect, requirePlatform } from '../../fixtures';
import { POST_FIELDS, invalidParamSchema, paginationOf, parseContract, parseLinkHeader, postSchema, restErrorSchema } from '../../api/schemas';
import { SAMPLE_ARTICLE_SLUG } from '../../targets';

const MAX_PER_PAGE = 100;
/** Small pages, so pagination is exercised with the blog's handful of posts. */
const SMALL_PAGE = 2;
const JSON_CONTENT_TYPE = /^application\/json; charset=UTF-8$/i;

test.describe('API — wp/v2/posts', () => {
  test.beforeEach(() => {
    requirePlatform('wordpress');
  });

  test('returns published posts that match the schema', async ({ wpApi }) => {
    const posts = await wpApi.posts({ per_page: MAX_PER_PAGE });

    expect(posts.length).toBeGreaterThan(0);
  });

  test('reports the total in headers and fits on one page', async ({ wpApi }) => {
    const response = await wpApi.postsResponse({ per_page: MAX_PER_PAGE });

    const total = Number(response.headers()['x-wp-total']);
    expect(total).toBeGreaterThan(0);
    expect(total, 'once past 100 posts, use WpApi.allPosts() where a test reads every post').toBeLessThanOrEqual(MAX_PER_PAGE);
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
    const posts = await wpApi.posts({ per_page: MAX_PER_PAGE, _fields: POST_FIELDS });

    for (const post of posts) {
      const response = await request.get(post.link);
      expect.soft(response.status(), post.link).toBe(200);
    }
  });
});

test.describe('API — wp/v2/posts pagination', () => {
  test.beforeEach(() => {
    requirePlatform('wordpress');
  });

  test('pages are disjoint and together hold exactly X-WP-Total posts', async ({ wpApi }) => {
    const first = await wpApi.postsResponse({ per_page: SMALL_PAGE, _fields: 'id' });
    const { total, totalPages } = paginationOf(first.headers());
    expect(totalPages).toBe(Math.ceil(total / SMALL_PAGE));

    const ids: number[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      const response = await wpApi.postsResponse({ per_page: SMALL_PAGE, page, _fields: 'id' });
      const items = (await response.json()) as { id: number }[];
      expect(items.length, `page ${page}`).toBeLessThanOrEqual(SMALL_PAGE);
      ids.push(...items.map((item) => item.id));
    }

    expect(ids).toHaveLength(total);
    expect(new Set(ids).size, 'a post appeared on two pages').toBe(total);
  });

  test('Link header points to the next page, and the last page has no next', async ({ wpApi }) => {
    const first = await wpApi.postsResponse({ per_page: SMALL_PAGE, _fields: 'id' });
    const { totalPages } = paginationOf(first.headers());
    test.skip(totalPages < 2, 'needs at least two pages of posts');

    const next = parseLinkHeader(first.headers()['link']).next;
    expect(next, 'page 1 links to page 2').toBeDefined();
    expect(new URL(next).searchParams.get('page')).toBe('2');

    const last = await wpApi.postsResponse({ per_page: SMALL_PAGE, page: totalPages, _fields: 'id' });
    const lastLinks = parseLinkHeader(last.headers()['link']);
    expect(lastLinks.next).toBeUndefined();
    expect(lastLinks.prev).toBeDefined();
  });

  test('a page past the end is a JSON 400, not an empty 200', async ({ wpApi }) => {
    const { totalPages } = paginationOf((await wpApi.postsResponse({ per_page: SMALL_PAGE, _fields: 'id' })).headers());

    const response = await wpApi.postsResponse({ per_page: SMALL_PAGE, page: totalPages + 1 });

    expect(response.status()).toBe(400);
    const error = parseContract(restErrorSchema, await response.json(), 'page-out-of-range error');
    expect(error.code).toBe('rest_post_invalid_page_number');
  });

  test('WpApi.allPosts() returns every post exactly once', async ({ wpApi }) => {
    const { total } = paginationOf((await wpApi.postsResponse({ _fields: 'id' })).headers());

    const posts = await wpApi.allPosts({ _fields: POST_FIELDS });

    expect(posts).toHaveLength(total);
    expect(new Set(posts.map((p) => p.id)).size).toBe(total);
  });
});

test.describe('API — wp/v2 contract', () => {
  test.beforeEach(() => {
    requirePlatform('wordpress');
  });

  const INVALID_PARAMS: readonly { query: string; params: Record<string, string | number>; param: string }[] = [
    { query: 'per_page=0', params: { per_page: 0 }, param: 'per_page' },
    { query: 'per_page=abc', params: { per_page: 'abc' }, param: 'per_page' },
    { query: 'page=0', params: { page: 0 }, param: 'page' },
    { query: 'orderby=bogus', params: { orderby: 'bogus' }, param: 'orderby' },
    { query: 'order=sideways', params: { order: 'sideways' }, param: 'order' },
    { query: 'status=draft', params: { status: 'draft' }, param: 'status' },
  ];
  for (const { query, params, param } of INVALID_PARAMS) {
    test(`rejects ${query} with a JSON 400 naming "${param}"`, async ({ wpApi }) => {
      const response = await wpApi.postsResponse(params);

      expect(response.status()).toBe(400);
      expect(response.headers()['content-type']).toMatch(JSON_CONTENT_TYPE);
      const error = parseContract(invalidParamSchema, await response.json(), `${param} error`);
      expect(Object.keys(error.data.params)).toEqual([param]);
    });
  }

  const NOT_FOUND: readonly { route: string; code: string }[] = [
    { route: '/posts/999999999', code: 'rest_post_invalid_id' },
    { route: '/zzqx-no-such-route', code: 'rest_no_route' },
  ];
  for (const { route, code } of NOT_FOUND) {
    test(`${route} is a JSON 404 "${code}" whose body status matches the HTTP status`, async ({ wpApi }) => {
      const response = await wpApi.get(route);

      expect(response.status()).toBe(404);
      expect(response.headers()['content-type']).toMatch(JSON_CONTENT_TYPE);
      const error = parseContract(restErrorSchema, await response.json(), `${route} error`);
      expect(error).toMatchObject({ code, data: { status: 404 } });
    });
  }

  test('collections are JSON with integer pagination headers', async ({ wpApi }) => {
    const response = await wpApi.postsResponse({ per_page: 1, _fields: 'id' });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(JSON_CONTENT_TYPE);
    expect(() => paginationOf(response.headers())).not.toThrow();
  });

  test('an empty result is [] with X-WP-Total 0', async ({ wpApi }) => {
    const response = await wpApi.postsResponse({ slug: 'zzqx-no-such-post' });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(paginationOf(response.headers())).toEqual({ total: 0, totalPages: 0 });
  });

  test('a single post matches its entry in the list', async ({ wpApi }) => {
    const [listed] = await wpApi.posts({ per_page: 1, _fields: POST_FIELDS });

    const response = await wpApi.get(`/posts/${listed.id}`, { _fields: POST_FIELDS });

    expect(response.status()).toBe(200);
    expect(parseContract(postSchema, await response.json(), `post ${listed.id}`)).toEqual(listed);
  });
});
