import type { APIRequestContext, APIResponse } from '@playwright/test';
import { siteUrl } from '../targets';
import { paginationOf, parseContract, postListSchema, type Post } from './schemas';

const REST_ROOT = '/wp-json/wp/v2';
const MAX_PER_PAGE = 100;
/** Stops a misbehaving `X-WP-TotalPages` from turning one test into hundreds of requests. */
const MAX_PAGES = 20;

type Params = Readonly<Record<string, string | number>>;

/**
 * Read-only client for the public WordPress REST API. Never add write methods: the target is
 * production. (The `request` it receives is guarded anyway: see network/writeGuard.ts.)
 *
 * `*Response()` methods return the raw response for contract tests (status, headers, error body);
 * the others validate the body against api/schemas.ts and throw a readable error on mismatch.
 */
export class WpApi {
  constructor(private readonly request: APIRequestContext) {}

  /** GET any route under `/wp-json/wp/v2`, e.g. `/posts/123`. */
  async get(route: string, params: Params = {}): Promise<APIResponse> {
    return this.request.get(siteUrl(`${REST_ROOT}${route}`), { params, failOnStatusCode: false });
  }

  /** GET the REST index (`/wp-json/`) or any other namespace route, e.g. `/wp-json/wp/v2/settings`. */
  async getRaw(path: string): Promise<APIResponse> {
    return this.request.get(siteUrl(path), { failOnStatusCode: false });
  }

  async postsResponse(params: Params = {}): Promise<APIResponse> {
    return this.get('/posts', params);
  }

  /** Fetches published posts and validates them against the schema. */
  async posts(params: Params = {}): Promise<Post[]> {
    const response = await this.postsResponse(params);
    if (!response.ok()) {
      throw new Error(`GET ${REST_ROOT}/posts failed: ${response.status()} ${response.statusText()}`);
    }
    return parseContract(postListSchema, await response.json(), `GET ${REST_ROOT}/posts`);
  }

  /** Every published post, following `X-WP-TotalPages`. */
  async allPosts(params: Params = {}): Promise<Post[]> {
    const first = await this.postsResponse({ ...params, per_page: MAX_PER_PAGE, page: 1 });
    const { totalPages } = paginationOf(first.headers());
    if (totalPages > MAX_PAGES) throw new Error(`X-WP-TotalPages is ${totalPages}; refusing to fetch more than ${MAX_PAGES} pages`);
    const posts = parseContract(postListSchema, await first.json(), `GET ${REST_ROOT}/posts?page=1`);
    for (let page = 2; page <= totalPages; page += 1) {
      posts.push(...(await this.posts({ ...params, per_page: MAX_PER_PAGE, page })));
    }
    return posts;
  }

  async usersResponse(): Promise<APIResponse> {
    return this.get('/users');
  }

  async postBySlug(slug: string): Promise<Post | undefined> {
    const [post] = await this.posts({ slug });
    return post;
  }
}
