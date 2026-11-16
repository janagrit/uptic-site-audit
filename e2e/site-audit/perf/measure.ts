import type { Page, Request } from '@playwright/test';
import type { ImageFacts, Sample } from './stats';

/**
 * One lab measurement of one page load: a cold cache, CDP network and CPU throttling (Lighthouse's
 * mobile figures, but applied per request: connection setup is not slowed), LCP and load-time CLS
 * from the browser's own PerformanceObservers, and every response's size from the network layer.
 *
 * `inpMs` is NOT INP. INP is a field metric over all of a real visitor's interactions. Here one
 * synthetic click lands on the page's main heading (inert text, so nothing navigates or submits)
 * after the page has settled, and the longest Event Timing entry is recorded. It shows how busy the
 * main thread is at that moment; it does not see slow handlers in menus or forms. Event Timing only
 * reports durations >= 16 ms, so 0 means "under 16 ms or not reported".
 */

export const THROTTLING = {
  /** Latency, download and upload figures of Lighthouse's "Slow 4G", applied by CDP per request. */
  latencyMs: 150,
  downloadBytesPerSecond: (1.6 * 1024 * 1024) / 8,
  uploadBytesPerSecond: (750 * 1024) / 8,
  cpuSlowdown: 4,
} as const;

const SETTLE_TIMEOUT_MS = 15_000;
const INTERACTION_REPORT_TIMEOUT_MS = 2_000;

export interface Measurement {
  readonly sample: Sample;
  /** Judged by imageIssues() in stats.ts. `neededWidth` = drawn width × device pixel ratio. */
  readonly images: readonly ImageFacts[];
}

/** Installed before any page script: records LCP, CLS (largest session window) and Event Timing. */
function observeVitals(): void {
  const state = { lcp: 0, cls: 0, inp: 0, interactions: 0 };
  (window as unknown as { __vitals: typeof state }).__vitals = state;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // CLS per web.dev: shifts without recent input, grouped in windows (gap < 1 s, span < 5 s); worst window counts.
  let windowValue = 0;
  let windowStart = 0;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (entry.hadRecentInput) continue;
      if (entry.startTime - last > 1000 || entry.startTime - windowStart > 5000) {
        windowValue = 0;
        windowStart = entry.startTime;
      }
      windowValue += entry.value;
      last = entry.startTime;
      state.cls = Math.max(state.cls, windowValue);
    }
  }).observe({ type: 'layout-shift', buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
      if (!entry.interactionId) continue;
      state.interactions += 1;
      state.inp = Math.max(state.inp, entry.duration);
    }
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
}

export async function measurePageLoad(page: Page, url: string): Promise<Measurement> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: THROTTLING.latencyMs,
    downloadThroughput: THROTTLING.downloadBytesPerSecond,
    uploadThroughput: THROTTLING.uploadBytesPerSecond,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLING.cpuSlowdown });
  await page.addInitScript(observeVitals);

  const responses: { url: string; type: string; bytes: number }[] = [];
  const pending: Promise<void>[] = [];
  page.on('requestfinished', (request: Request) => {
    pending.push(
      request.sizes().then((sizes) => {
        responses.push({ url: request.url(), type: request.resourceType(), bytes: sizes.responseBodySize + sizes.responseHeadersSize });
      }),
    );
  });

  await page.goto(url, { waitUntil: 'load' });
  // Late requests (fonts, lazy images, analytics) count toward page weight; a page that never goes idle is still measured.
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);

  const heading = await page.locator('h1').first().boundingBox();
  if (heading) {
    await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2);
    await page
      .waitForFunction(() => (window as unknown as { __vitals: { interactions: number } }).__vitals.interactions > 0, undefined, {
        timeout: INTERACTION_REPORT_TIMEOUT_MS,
      })
      .catch(() => undefined); // a click faster than 16 ms is not reported: inpMs stays 0
  }

  await Promise.all(pending);
  const vitals = await page.evaluate(() => (window as unknown as { __vitals: { lcp: number; cls: number; inp: number } }).__vitals);
  const bytesOf = (type?: string): number => responses.filter((r) => !type || r.type === type).reduce((sum, r) => sum + r.bytes, 0);
  const bytesByUrl = new Map(responses.map((r) => [r.url, r.bytes]));

  const images = await page.locator('img').evaluateAll((elements) =>
    elements
      .map((el) => el as HTMLImageElement)
      .filter((img) => img.currentSrc && img.getBoundingClientRect().width > 0)
      .map((img) => ({
        url: img.currentSrc,
        naturalWidth: img.naturalWidth,
        neededWidth: Math.round(img.getBoundingClientRect().width * devicePixelRatio),
        hasDimensions: img.hasAttribute('width') && img.hasAttribute('height'),
        lazy: img.loading === 'lazy',
        aboveTheFold: img.getBoundingClientRect().top < innerHeight,
      })),
  );

  return {
    sample: {
      lcpMs: Math.round(vitals.lcp),
      cls: Number(vitals.cls.toFixed(4)),
      inpMs: Math.round(vitals.inp),
      totalBytes: bytesOf(),
      scriptBytes: bytesOf('script'),
      imageBytes: bytesOf('image'),
      requests: responses.length,
    },
    images: images.map((image) => ({ ...image, bytes: bytesByUrl.get(image.url) ?? 0 })),
  };
}
