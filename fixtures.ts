import { test as base, expect } from '@playwright/test';
import { WpApi } from './api/WpApi';
import { installWriteGuard, type BlockedWrite } from './network/writeGuard';
import { ArticlePage } from './page-objects/ArticlePage';
import { BasePage } from './page-objects/BasePage';
import { ContactPage } from './page-objects/ContactPage';
import { HomePage } from './page-objects/HomePage';
import { SearchPage } from './page-objects/SearchPage';
import { SiteHeader } from './page-objects/SiteHeader';
import type { AuditCheck, AuditPage } from './targets';

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
  /** Writes to production that the auto-installed guard aborted. Always on; see network/writeGuard.ts. */
  blockedWrites: readonly BlockedWrite[];
}

export const test = base.extend<AuditFixtures>({
  blockedWrites: [async ({ page }, use) => use(await installWriteGuard(page)), { auto: true }],
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

/** Browserless test for tests/api: no page, so no write guard is needed or installed. */
export const apiTest = base.extend<{ wpApi: WpApi }>({
  wpApi: async ({ request }, use) => use(new WpApi(request)),
});

export { expect };

/**
 * Marks the current test as an expected failure when the target has a known issue for this check.
 * The test turns red once the site is fixed, signalling the entry can be removed.
 */
export function expectKnownIssue(target: AuditPage, check: AuditCheck): void {
  const finding = target.knownIssues?.[check];
  test.fail(finding !== undefined, `Known site defect — ${finding}`);
}
