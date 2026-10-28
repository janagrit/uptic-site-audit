import type { Page, Request, Route } from '@playwright/test';
import { isAction } from './endpoints';

export interface FulfillOptions {
  readonly status?: number;
  readonly body?: string;
  readonly contentType?: string;
  /** e.g. `{ location }` with a 3xx status to replay the server's redirect. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Interception {
  readonly requests: readonly Request[];
}

/**
 * Fulfills POSTs to `pattern` whose `action` field matches, records them, and lets everything
 * else fall through to earlier routes (the write guard).
 */
export async function interceptAction(
  page: Page,
  pattern: string,
  action: string,
  options: FulfillOptions = {},
): Promise<Interception> {
  const requests: Request[] = [];

  await page.route(pattern, async (route: Route) => {
    if (!isAction(route.request(), action)) {
      return route.fallback();
    }
    requests.push(route.request());
    await route.fulfill({
      status: options.status ?? 200,
      contentType: options.contentType ?? 'text/html; charset=UTF-8',
      headers: options.headers,
      body: options.body ?? '<!doctype html><title>intercepted</title><p>intercepted by test</p>',
    });
  });

  return { requests };
}
