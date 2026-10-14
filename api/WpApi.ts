import type { APIRequestContext, APIResponse } from '@playwright/test';
import { postListSchema, type Post } from './schemas';

const REST_ROOT = '/wp-json/wp/v2';

/** Read-only client for the public WordPress REST API. Never add write methods: the target is production. */
export class WpApi {
  constructor(private readonly request: APIRequestContext) {}

  async postsResponse(params: Readonly<Record<string, string | number>> = {}): Promise<APIResponse> {
    return this.request.get(`${REST_ROOT}/posts`, { params });
  }

  /** Fetches published posts and validates them against the schema; throws with details on mismatch. */
  async posts(params: Readonly<Record<string, string | number>> = {}): Promise<Post[]> {
    const response = await this.postsResponse(params);
    if (!response.ok()) {
      throw new Error(`GET ${REST_ROOT}/posts failed: ${response.status()} ${response.statusText()}`);
    }
    return postListSchema.parse(await response.json());
  }

  async usersResponse(): Promise<APIResponse> {
    return this.request.get(`${REST_ROOT}/users`);
  }

  async postBySlug(slug: string): Promise<Post | undefined> {
    const [post] = await this.posts({ slug });
    return post;
  }
}
