import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { unitTest as test, expect } from '../../fixtures';
import { ADMIN_POST, CONTACT_ACTION } from '../../network/endpoints';
import { interceptAction } from '../../network/mocks';
import { blockReason, createWritePolicy, guardApiRequest, installWriteGuard, protectedHostsOf, WriteBlockedError, type BlockedWrite } from '../../network/writeGuard';

/**
 * The guard is tested against a fake site, never production: `.example` hosts cannot resolve, and
 * a stub route answers every request that gets past the guard and records it as "reached the
 * network". If the guard were broken, these tests would fail without anything leaving the machine.
 */

const SITE = 'https://site.example/';
const POLICY = createWritePolicy([SITE, 'https://www.prod.example/']);

test.describe('Unit — Write policy', () => {
  const cases: ReadonlyArray<[method: string, url: string, expected: ReturnType<typeof blockReason>]> = [
    ['GET', 'https://site.example/contact/', null],
    ['HEAD', 'https://site.example/', null],
    ['OPTIONS', 'https://site.example/wp-json/', null],
    ['get', 'https://site.example/', null],
    ['POST', 'https://site.example/wp-json/wp/v2/posts', 'unsafe-method'],
    ['PUT', 'https://site.example/wp-json/wp/v2/posts/1', 'unsafe-method'],
    ['PATCH', 'https://site.example/wp-json/wp/v2/posts/1', 'unsafe-method'],
    ['DELETE', 'https://site.example/wp-json/wp/v2/posts/1', 'unsafe-method'],
    ['PROPFIND', 'https://site.example/', 'unsafe-method'],
    ['post', 'https://site.example/brand-new-endpoint', 'unsafe-method'],
    ['POST', 'http://site.example/', 'unsafe-method'],
    ['POST', 'https://www.site.example/', 'unsafe-method'],
    ['POST', 'https://prod.example/', 'unsafe-method'],
    ['POST', 'https://SITE.example/', 'unsafe-method'],
    ['GET', 'https://site.example/wp-admin/admin-ajax.php?action=uptic_article_view', 'write-endpoint'],
    ['GET', 'https://site.example/wp-admin/admin-post.php', 'write-endpoint'],
    ['POST', 'https://site.example/wp-comments-post.php', 'write-endpoint'],
    ['POST', 'https://site.example/xmlrpc.php', 'write-endpoint'],
    ['POST', 'https://mirror.example/xmlrpc.php', 'write-endpoint'],
    ['POST', 'https://analytics.example/collect', null],
    ['GET', 'data:text/plain,hi', null],
    ['POST', 'not a url', 'unsafe-method'],
  ];
  for (const [method, url, expected] of cases) {
    test(`${method} ${url} → ${expected ?? 'allowed'}`, () => {
      expect(blockReason(method, url, POLICY)).toBe(expected);
    });
  }

  test('protects the bare and www host of every site URL', () => {
    expect([...protectedHostsOf(['https://www.a.example/', 'https://b.example/sub/'])].sort()).toEqual([
      'a.example',
      'b.example',
      'www.a.example',
      'www.b.example',
    ]);
  });
});

interface GuardedPage {
  readonly page: Page;
  readonly blocked: readonly BlockedWrite[];
  /** `METHOD host/path` of every request that got past the guard (and any test mock). */
  readonly reached: string[];
}

async function guardedPage(context: BrowserContext): Promise<GuardedPage> {
  const reached: string[] = [];
  // Registered first, so it runs last: it stands in for the network.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    reached.push(`${route.request().method()} ${url.host}${url.pathname}`);
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' });
  });
  const blocked = await installWriteGuard(context, POLICY);
  const page = await context.newPage();
  await page.goto(SITE);
  return { page, blocked, reached };
}

/** fetch() from inside the page; resolves to the status, or "blocked" when the request was aborted. */
function send(page: Page, method: string, url: string, body?: string): Promise<number | 'blocked'> {
  return page.evaluate(
    async ({ method, url, body }) => {
      try {
        const headers = body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined;
        return (await fetch(url, { method, body, headers })).status;
      } catch {
        return 'blocked' as const;
      }
    },
    { method, url, body },
  );
}

test.describe('Unit — Write guard in the browser', () => {
  test('lets GET through to the network', async ({ context }) => {
    const { page, blocked, reached } = await guardedPage(context);

    expect(await send(page, 'GET', '/insights/')).toBe(200);
    expect(reached).toContain('GET site.example/insights/');
    expect(blocked).toEqual([]);
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    test(`aborts ${method} to the site and records it`, async ({ context }) => {
      const { page, blocked, reached } = await guardedPage(context);

      expect(await send(page, method, '/wp-json/wp/v2/posts/1', 'title=x')).toBe('blocked');
      expect(reached).toEqual(['GET site.example/']);
      expect(blocked).toEqual([{ method, url: 'https://site.example/wp-json/wp/v2/posts/1', action: null, reason: 'unsafe-method' }]);
    });
  }

  test('aborts a POST to an endpoint nobody listed (fail-safe)', async ({ context }) => {
    const { page, blocked } = await guardedPage(context);

    expect(await send(page, 'POST', '/some-plugin/v9/new-endpoint', 'action=subscribe')).toBe('blocked');
    expect(blocked).toEqual([expect.objectContaining({ action: 'subscribe', reason: 'unsafe-method' })]);
  });

  test('aborts even a GET to a WordPress write endpoint', async ({ context }) => {
    const { page, blocked, reached } = await guardedPage(context);

    expect(await send(page, 'GET', '/wp-admin/admin-ajax.php?action=uptic_article_view')).toBe('blocked');
    expect(reached).toEqual(['GET site.example/']);
    expect(blocked).toEqual([expect.objectContaining({ reason: 'write-endpoint' })]);
  });

  test('a mocked write is answered by the mock: not blocked, not sent', async ({ context }) => {
    const { page, blocked, reached } = await guardedPage(context);
    const inquiry = await interceptAction(page, ADMIN_POST, CONTACT_ACTION);

    expect(await send(page, 'POST', '/wp-admin/admin-post.php', `action=${CONTACT_ACTION}&email=qa%40example.com`)).toBe(200);
    expect(inquiry.requests).toHaveLength(1);
    expect(blocked).toEqual([]);
    expect(reached).toEqual(['GET site.example/']);
  });

  test('a write the mock does not match falls through to the guard', async ({ context }) => {
    const { page, blocked } = await guardedPage(context);
    const inquiry = await interceptAction(page, ADMIN_POST, CONTACT_ACTION);

    expect(await send(page, 'POST', '/wp-admin/admin-post.php', 'action=other_action')).toBe('blocked');
    expect(inquiry.requests).toHaveLength(0);
    expect(blocked).toEqual([expect.objectContaining({ action: 'other_action', reason: 'write-endpoint' })]);
  });

  test('covers pages opened later in the same context (popups, new tabs)', async ({ context }) => {
    const { blocked } = await guardedPage(context);
    const second = await context.newPage();
    await second.goto(SITE);

    expect(await send(second, 'DELETE', '/x')).toBe('blocked');
    expect(blocked).toHaveLength(1);
  });
});

test.describe('Unit — Write guard for API requests', () => {
  const calls: string[] = [];
  const fake = {
    get: (url: string) => Promise.resolve(calls.push(`get ${url}`)),
    fetch: (input: string, options?: { method?: string }) => Promise.resolve(calls.push(`fetch ${options?.method ?? 'GET'} ${input}`)),
    post: () => Promise.resolve(calls.push('post sent')),
    put: () => Promise.resolve(calls.push('put sent')),
    patch: () => Promise.resolve(calls.push('patch sent')),
    delete: () => Promise.resolve(calls.push('delete sent')),
  } as unknown as APIRequestContext;
  const guarded = guardApiRequest(fake);

  test.beforeEach(() => {
    calls.length = 0;
  });

  test('passes reads through', async () => {
    await guarded.get('/wp-json/wp/v2/posts');
    await guarded.fetch('/wp-json/', { method: 'HEAD' });

    expect(calls).toEqual(['get /wp-json/wp/v2/posts', 'fetch HEAD /wp-json/']);
  });

  for (const method of ['post', 'put', 'patch', 'delete'] as const) {
    test(`throws on request.${method}() before sending`, () => {
      expect(() => guarded[method]('/wp-json/wp/v2/posts')).toThrow(WriteBlockedError);
      expect(calls).toEqual([]);
    });
  }

  test('throws on fetch() with an unsafe method', () => {
    expect(() => guarded.fetch('/wp-json/wp/v2/posts', { method: 'post' })).toThrow(/read-only/);
    expect(calls).toEqual([]);
  });
});
