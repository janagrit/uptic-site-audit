import { test as base, expect } from '@playwright/test';
import { BasePage } from './page-objects/BasePage';
import { HomePage } from './page-objects/HomePage';
import { SearchPage } from './page-objects/SearchPage';
import { SiteHeader } from './page-objects/SiteHeader';
import type { AuditCheck, AuditPage } from './targets';

interface AuditFixtures {
  basePage: BasePage;
  homePage: HomePage;
  searchPage: SearchPage;
  siteHeader: SiteHeader;
  /** Uncaught JavaScript errors thrown by the page during the test. */
  pageErrors: string[];
}

export const test = base.extend<AuditFixtures>({
  basePage: async ({ page }, use) => use(new BasePage(page)),
  homePage: async ({ page }, use) => use(new HomePage(page)),
  searchPage: async ({ page }, use) => use(new SearchPage(page)),
  siteHeader: async ({ page }, use) => use(new SiteHeader(page)),
  pageErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
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
