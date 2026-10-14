import type { Page } from '@playwright/test';
import { WRITE_ENDPOINTS } from './endpoints';

export interface BlockedWrite {
  readonly method: string;
  readonly url: string;
  readonly action: string | null;
}

/**
 * Aborts every request to a write endpoint so tests never send inquiries or inflate view counts
 * on production. Tests that want to observe one of these requests register their own `page.route`,
 * which Playwright runs before this guard because later routes take precedence.
 */
export async function installWriteGuard(page: Page): Promise<readonly BlockedWrite[]> {
  const blocked: BlockedWrite[] = [];
  for (const pattern of WRITE_ENDPOINTS) {
    await page.route(pattern, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        return route.continue();
      }
      blocked.push({
        method: request.method(),
        url: request.url(),
        action: new URLSearchParams(request.postData() ?? '').get('action'),
      });
      await route.abort('blockedbyclient');
    });
  }
  return blocked;
}
