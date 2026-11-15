import type { APIRequestContext, BrowserContext, Route } from '@playwright/test';
import { WRITE_ENDPOINT_PATHS } from './endpoints';

/**
 * Production write protection. Two layers, one policy:
 *
 * 1. Browser: `installWriteGuard()` routes every request of a browser context. Unsafe methods to
 *    a protected host, and any request to a known write endpoint, are aborted and recorded.
 * 2. API: `guardApiRequest()` wraps the `request` fixture so post/put/patch/delete (and fetch with
 *    an unsafe method) throw before anything is sent.
 *
 * Fail-safe by design: the guard does not need to know an endpoint to block it. Any POST, PUT,
 * PATCH, DELETE or unknown method to the site is blocked; the WordPress endpoint list only adds
 * paths that can write even on GET.
 *
 * Tests that want to observe a write intercept it with `page.route` / `interceptAction()`. Page
 * routes run before context routes, so the mock answers first and nothing reaches the guard or
 * the network.
 */

/** Methods that must not change server state (RFC 9110 §9.2.1). Everything else is unsafe. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

export type BlockReason = 'unsafe-method' | 'write-endpoint';

export interface WritePolicy {
  /** Hostnames that must never receive a write (the target and production, with and without www). */
  readonly protectedHosts: ReadonlySet<string>;
  readonly writeEndpointPaths: readonly RegExp[];
}

export interface BlockedWrite {
  readonly method: string;
  readonly url: string;
  /** The WordPress `action` field of a form-encoded body, when there is one. */
  readonly action: string | null;
  readonly reason: BlockReason;
}

export class WriteBlockedError extends Error {
  override name = 'WriteBlockedError';
}

/** Protected hostnames for a set of site URLs; `www.` and the bare domain protect each other. */
export function protectedHostsOf(urls: readonly string[]): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const url of urls) {
    const bare = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    hosts.add(bare).add(`www.${bare}`);
  }
  return hosts;
}

export function createWritePolicy(siteUrls: readonly string[]): WritePolicy {
  return { protectedHosts: protectedHostsOf(siteUrls), writeEndpointPaths: WRITE_ENDPOINT_PATHS };
}

/**
 * Decides whether a request may leave the browser. Pure, so every method/URL combination is unit
 * tested. Returns the reason to block, or null to allow.
 *
 * Third-party hosts may receive unsafe methods (analytics beacons, embeds): they are not the
 * system under test, and blocking them would change the page's behaviour. Known WordPress write
 * endpoints are blocked on every host.
 */
export function blockReason(method: string, url: string, policy: WritePolicy): BlockReason | null {
  const safe = SAFE_METHODS.has(method.toUpperCase());
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return safe ? null : 'unsafe-method';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null; // data:, blob:
  if (policy.writeEndpointPaths.some((pattern) => pattern.test(parsed.pathname))) return 'write-endpoint';
  if (!safe && policy.protectedHosts.has(parsed.hostname.toLowerCase())) return 'unsafe-method';
  return null;
}

function actionOf(postData: string | null): string | null {
  return new URLSearchParams(postData ?? '').get('action');
}

/**
 * Routes every request of `context` through the policy. Allowed requests fall back to the next
 * handler (the network, or a stub registered earlier); blocked ones are aborted and recorded.
 */
export async function installWriteGuard(context: BrowserContext, policy: WritePolicy): Promise<readonly BlockedWrite[]> {
  const blocked: BlockedWrite[] = [];
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const reason = blockReason(request.method(), request.url(), policy);
    if (reason === null) {
      return route.fallback();
    }
    blocked.push({ method: request.method(), url: request.url(), action: actionOf(request.postData()), reason });
    await route.abort('blockedbyclient');
  });
  return blocked;
}

const WRITE_SHORTCUTS: ReadonlySet<string> = new Set(['post', 'put', 'patch', 'delete']);

type FetchInput = Parameters<APIRequestContext['fetch']>[0];
type FetchOptions = Parameters<APIRequestContext['fetch']>[1];

/**
 * Wraps an APIRequestContext so it can only read: post/put/patch/delete throw, and so does
 * `fetch` with an unsafe method, on any host. The API suite has no reason to write anywhere.
 */
export function guardApiRequest(request: APIRequestContext): APIRequestContext {
  return new Proxy(request, {
    get(target, property, receiver) {
      if (typeof property === 'string' && WRITE_SHORTCUTS.has(property)) {
        return (url: string) => {
          throw new WriteBlockedError(`request.${property}(${url}) blocked: the API suite is read-only`);
        };
      }
      if (property === 'fetch') {
        return (input: FetchInput, options?: FetchOptions) => {
          const method = options?.method ?? (typeof input === 'string' ? 'GET' : input.method());
          const url = typeof input === 'string' ? input : input.url();
          if (!SAFE_METHODS.has(method.toUpperCase())) {
            throw new WriteBlockedError(`request.fetch(${url}, { method: '${method}' }) blocked: the API suite is read-only`);
          }
          return target.fetch(input, options);
        };
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
