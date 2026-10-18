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
    // Matched by name: results once embedded full pages with their own h1s (FINDINGS #12, fixed).
    this.heading = page.getByRole('heading', { level: 1, name: /Search results for/ });
    this.form = page.getByRole('search');
    this.input = this.form.getByRole('searchbox');
    this.submitButton = this.form.getByRole('button', { name: 'Search' });
    this.results = page.locator('main .wp-block-query').first();
    this.resultTitles = this.results.locator('.wp-block-post-title');
    this.resultFullContent = this.results.locator('.wp-block-post-content');
    this.noResultsMessage = page.getByText(/nothing was found/i);
  }

  async open(query: string): Promise<Response | null> {
    return super.open(`/?s=${encodeURIComponent(query)}`);
  }

  async searchFor(query: string): Promise<void> {
    await this.input.fill(query);
    await Promise.all([this.page.waitForURL(/[?&]s=/), this.submitButton.click()]);
  }
}
