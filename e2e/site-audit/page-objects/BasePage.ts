import type { Page, Response } from '@playwright/test';
import { siteUrl } from '../targets';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /** Opens a path on the site under test, keeping any path prefix in BASE_URL. */
  async open(path: string): Promise<Response | null> {
    return this.page.goto(siteUrl(path));
  }
}
