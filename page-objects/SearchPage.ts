import type { Locator, Page, Response } from '@playwright/test';
import { BasePage } from './BasePage';

export class SearchPage extends BasePage {
  readonly heading: Locator;
  readonly form: Locator;
  readonly input: Locator;
  readonly submitButton: Locator;
  /** The search query loop; the "More posts" loop below it is excluded. */
  readonly results: Locator;
  readonly resultTitles: Locator;
  readonly resultFullContent: Locator;
  readonly noResultsMessage: Locator;

  constructor(page: Page) {
    super(page);
    // The server renders "Search results for: …" and an inline script rewrites it to "Results for …".
    this.heading = page.getByRole('heading', { level: 1, name: /results for/i });
    this.form = page.getByRole('search');
    this.input = this.form.getByRole('searchbox');
    this.submitButton = this.form.getByRole('button', { name: 'Search' });
    this.results = page.locator('main .wp-block-query').first();
    this.resultTitles = this.results.locator('.wp-block-post-title');
    this.resultFullContent = this.results.locator('.wp-block-post-content');
    // CSS: the "No results" block has no role, and its wording is editable in the template.
    this.noResultsMessage = this.results.locator('.wp-block-query-no-results');
  }

  async open(query: string): Promise<Response | null> {
    return super.open(`/?s=${encodeURIComponent(query)}`);
  }

  async searchFor(query: string): Promise<void> {
    await this.input.fill(query);
    await Promise.all([this.page.waitForURL(/[?&]s=/), this.submitButton.click()]);
  }
}
