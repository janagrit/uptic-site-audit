import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
import { WpApi } from './api/WpApi';
import { createWritePolicy, guardApiRequest, installWriteGuard, type BlockedWrite, type WritePolicy } from './network/writeGuard';
import { ArticlePage } from './page-objects/ArticlePage';
import { BasePage } from './page-objects/BasePage';
import { ContactPage } from './page-objects/ContactPage';
import { HomePage } from './page-objects/HomePage';
import { SearchPage } from './page-objects/SearchPage';
import { SiteHeader } from './page-objects/SiteHeader';
import { BASE_URL, PRODUCTION_URL, TARGET, type Platform } from './targets';

/** The target and production hosts are protected even when BASE_URL points at staging. */
const WRITE_POLICY: WritePolicy = createWritePolicy([BASE_URL, PRODUCTION_URL]);

interface AuditFixtures {
  basePage: BasePage;
  homePage: HomePage;
  searchPage: SearchPage;
  contactPage: ContactPage;
  articlePage: ArticlePage;
  siteHeader: SiteHeader;
  wpApi: WpApi;
  /** Uncaught JavaScript errors thrown by the page during the test. */
  pageErrors: string[];
  /** Writes the auto-installed guard aborted. Always on; see network/writeGuard.ts. */
  blockedWrites: readonly BlockedWrite[];
}

/** `request` that can only read (post/put/patch/delete throw). Used by browser and API tests alike. */
async function readOnlyRequest(
  { request }: { request: APIRequestContext },
  use: (request: APIRequestContext) => Promise<void>,
): Promise<void> {
  await use(guardApiRequest(request));
}

export const test = base.extend<AuditFixtures>({
  // Context-level, so popups and every page of the context are covered too.
  blockedWrites: [async ({ context }, use) => use(await installWriteGuard(context, WRITE_POLICY)), { auto: true }],
  request: readOnlyRequest,
  basePage: async ({ page }, use) => use(new BasePage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  searchPage: async ({ page }, use) => use(new SearchPage(page)),
  contactPage: async ({ page }, use) => use(new ContactPage(page)),
  articlePage: async ({ page }, use) => use(new ArticlePage(page)),
  siteHeader: async ({ page }, use) => use(new SiteHeader(page)),
  wpApi: async ({ request }, use) => use(new WpApi(request)),
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
});

/** Browserless test for tests/api: no page, so only the read-only `request` guard applies. */
export const apiTest = base.extend<{ wpApi: WpApi }>({
  request: readOnlyRequest,
  wpApi: async ({ request }, use) => use(new WpApi(request)),
});

/**
 * A fresh browser context with the write guard installed, for tests that need several clean
 * contexts in one test (the performance runs measure cold loads).
 */
export async function newGuardedContext(browser: Browser, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options });
  await installWriteGuard(context, WRITE_POLICY);
  return context;
}

/** Test for tests/unit: pure logic, no site. Re-exported so specs keep the "import from fixtures" rule. */
export const unitTest = base;

/**
 * Skips the calling test or describe unless the target runs on `platform` (e.g. the WordPress REST
 * suite against a non-WordPress site). A target capability check, never a way to hide a defect.
 */
export function requirePlatform(platform: Platform): void {
  base.skip(TARGET.platform !== platform, `needs a ${platform} target; ${TARGET.id} is ${TARGET.platform}`);
}

export { expect };

export { expectKnownIssue, knownBug } from './knownBugs';
