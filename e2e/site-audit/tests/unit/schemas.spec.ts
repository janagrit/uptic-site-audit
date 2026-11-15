import { unitTest as test, expect } from '../../fixtures';
import { invalidParamSchema, paginationOf, parseContract, parseLinkHeader, postListSchema, restErrorSchema } from '../../api/schemas';

/** Shapes taken from real wp/v2 responses (2026-11-15), trimmed to the fields the suite reads. */
const POST = {
  id: 5286,
  slug: 'independent-hotels-should-think-independently',
  status: 'publish',
  link: 'https://uptichospitality.com/independent-hotels-should-think-independently/',
  date_gmt: '2026-10-01T12:00:00',
  title: { rendered: 'Independent Hotels Should Think Independently' },
  excerpt: { rendered: '<p>Brands win on consistency.</p>' },
};
const INVALID_PARAM = {
  code: 'rest_invalid_param',
  message: 'Invalid parameter(s): per_page',
  data: {
    status: 400,
    params: { per_page: 'per_page must be between 1 (inclusive) and 100 (inclusive)' },
    details: { per_page: { code: 'rest_out_of_bounds', message: 'per_page must be between 1 (inclusive) and 100 (inclusive)', data: null } },
  },
};

test.describe('Unit — REST contracts', () => {
  test('accepts a real post list, extra fields included', () => {
    expect(parseContract(postListSchema, [{ ...POST, author: 1, meta: [] }], 'posts')).toHaveLength(1);
  });

  const BROKEN: ReadonlyArray<[name: string, data: unknown, path: string]> = [
    ['missing slug', [{ ...POST, slug: undefined }], '[0].slug'],
    ['id as a string', [{ ...POST, id: '5286' }], '[0].id'],
    ['draft leaking into the public list', [{ ...POST, status: 'draft' }], '[0].status'],
    ['relative link', [{ ...POST, link: '/independent-hotels/' }], '[0].link'],
    ['date with a timezone', [{ ...POST, date_gmt: '2026-10-01T12:00:00Z' }], '[0].date_gmt'],
    ['title as a plain string', [{ ...POST, title: 'Independent Hotels' }], '[0].title'],
    ['an object instead of a list', POST, '(root)'],
  ];
  for (const [name, data, path] of BROKEN) {
    test(`rejects ${name} and names the path`, () => {
      expect(() => parseContract(postListSchema, data, 'GET /posts')).toThrow(`  ${path}:`);
    });
  }

  test('error envelope: accepts a real rest_invalid_param error', () => {
    expect(parseContract(invalidParamSchema, INVALID_PARAM, 'error').data.params).toHaveProperty('per_page');
  });

  test('error envelope: rejects a 200 status, a missing message and HTML instead of JSON', () => {
    expect(() => parseContract(restErrorSchema, { ...INVALID_PARAM, data: { status: 200 } }, 'error')).toThrow('data.status');
    expect(() => parseContract(restErrorSchema, { code: 'rest_no_route', data: { status: 404 } }, 'error')).toThrow('message');
    expect(() => parseContract(restErrorSchema, '<html>Forbidden</html>', 'error')).toThrow('(root)');
  });

  test('pagination headers must be integers', () => {
    expect(paginationOf({ 'x-wp-total': '7', 'x-wp-totalpages': '4' })).toEqual({ total: 7, totalPages: 4 });
    expect(() => paginationOf({ 'x-wp-total': '7' })).toThrow('x-wp-totalpages');
    expect(() => paginationOf({ 'x-wp-total': 'seven', 'x-wp-totalpages': '1' })).toThrow('x-wp-total');
  });

  test('parses a Link header into rel → URL', () => {
    const header = '<https://site.example/wp-json/wp/v2/posts?page=1>; rel="prev", <https://site.example/wp-json/wp/v2/posts?page=3>; rel="next"';

    expect(parseLinkHeader(header)).toEqual({
      prev: 'https://site.example/wp-json/wp/v2/posts?page=1',
      next: 'https://site.example/wp-json/wp/v2/posts?page=3',
    });
    expect(parseLinkHeader(undefined)).toEqual({});
  });
});
